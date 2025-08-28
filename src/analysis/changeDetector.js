import fs from 'fs/promises';
import path from 'path';
import { MongoStorage } from '../storage/mongoStorage.js';

export class ChangeDetector {
  constructor(snapshotsDir = './data/snapshots') {
    this.snapshotsDir = snapshotsDir;
    this.mongoStorage = new MongoStorage();
    this.useMongoDb = process.env.USE_MONGODB === 'true';
  }

  async ensureSnapshotsDir() {
    try {
      await fs.mkdir(this.snapshotsDir, { recursive: true });
    } catch (error) {
      console.error('Error creating snapshots directory:', error);
    }
  }

  getSnapshotPath(url) {
    // Convert URL to safe filename
    const filename = url.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
    return path.join(this.snapshotsDir, filename);
  }

  async loadPreviousSnapshot(url) {
    if (this.useMongoDb) {
      try {
        return await this.mongoStorage.loadPreviousSnapshot(url);
      } catch (error) {
        console.warn('⚠️ MongoDB load failed, falling back to file storage');
        this.useMongoDb = false;
      }
    }
    
    const snapshotPath = this.getSnapshotPath(url);
    
    try {
      const data = await fs.readFile(snapshotPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // No previous snapshot exists
      return null;
    }
  }

  async saveSnapshot(policyData) {
    if (this.useMongoDb) {
      try {
        return await this.mongoStorage.saveSnapshot(policyData);
      } catch (error) {
        console.warn('⚠️ MongoDB save failed, falling back to file storage');
        this.useMongoDb = false;
      }
    }
    
    await this.ensureSnapshotsDir();
    const snapshotPath = this.getSnapshotPath(policyData.url);
    
    const snapshot = {
      ...policyData,
      snapshotDate: new Date().toISOString()
    };

    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
    console.log(`💾 Saved snapshot for: ${policyData.url}`);
  }

  async detectChanges(currentData) {
    const previousSnapshot = await this.loadPreviousSnapshot(currentData.url);
    
    if (!previousSnapshot) {
      console.log(`🆕 New policy detected: ${currentData.title}`);
      return {
        isNew: true,
        hasChanges: false,
        changes: {
          type: 'NEW_POLICY',
          changeType: 'NEW_POLICY',
          url: currentData.url,
          title: currentData.title,
          description: `New policy detected: ${currentData.title}`,
          detectedAt: new Date().toISOString()
        }
      };
    }

    // Compare content hashes
    const hasContentChanged = previousSnapshot.contentHash !== currentData.contentHash;
    
    if (!hasContentChanged) {
      console.log(`✅ No changes detected for: ${currentData.title}`);
      return {
        isNew: false,
        hasChanges: false,
        changes: null
      };
    }

    console.log(`🔄 Hash changes detected for: ${currentData.title}`);
    
    // Analyze the type of change
    const changes = this.analyzeChanges(previousSnapshot, currentData);
    
    // If only formatting or structural changes, don't treat as meaningful change
    if (changes.skipNotification) {
      console.log(`⚪ Only ${changes.changeType.toLowerCase().replace('_', ' ')} detected for: ${currentData.title} - skipping notification`);
      return {
        isNew: false,
        hasChanges: false,
        changes: null
      };
    }
    
    console.log(`📧 Meaningful changes detected for: ${currentData.title} - ${changes.changeType}`);
    
    return {
      isNew: false,
      hasChanges: true,
      changes,
      previousSnapshot,
      currentData
    };
  }

  analyzeChanges(previous, current) {
    const changes = {
      type: 'CONTENT_MODIFIED',
      url: current.url,
      title: current.title,
      previousHash: previous.contentHash,
      currentHash: current.contentHash,
      previousModified: previous.lastModified,
      currentModified: current.lastModified,
      detectedAt: new Date().toISOString()
    };

    // Perform semantic content comparison
    const semanticDiff = this.calculateSemanticDifference(previous.content, current.content);
    
    // Check for structural-only changes first, but with safety checks
    if (semanticDiff.isStructuralOnly) {
      // Safety check: Look for critical policy keywords even in structural changes
      const hasCriticalPolicyTerms = this.containsCriticalPolicyChanges(previous.content, current.content);
      if (hasCriticalPolicyTerms) {
        console.log(`⚠️ Structural change contains critical policy terms - sending alert anyway`);
        changes.changeType = 'CRITICAL_POLICY_IN_STRUCTURAL';
        changes.description = 'Critical policy changes detected within structural updates';
      } else {
        changes.changeType = 'STRUCTURAL_ONLY';
        changes.description = 'Only website navigation or structural changes detected';
        changes.skipNotification = true;
        return changes;
      }
    }
    
    // Use policy-specific differences for classification
    const policyChanges = semanticDiff.policyWordDiff || semanticDiff.significantChanges;
    
    if (policyChanges > 15) {
      changes.changeType = 'MAJOR_ADDITION';
      changes.description = `Significant policy changes detected (${policyChanges} policy-relevant changes)`;
    } else if (policyChanges > 8) {
      changes.changeType = 'MODERATE_CHANGE';
      changes.description = `Moderate policy updates detected (${policyChanges} policy changes)`;
    } else if (policyChanges > 3) {
      changes.changeType = 'MINOR_MODIFICATION';
      changes.description = `Minor policy modifications detected (${policyChanges} policy changes)`;
    } else {
      // Very few meaningful changes - but check for critical terms first
      const hasCriticalTerms = this.containsCriticalPolicyChanges(previous.content, current.content);
      if (hasCriticalTerms) {
        changes.changeType = 'CRITICAL_MINOR_CHANGE';
        changes.description = 'Minor changes detected but contain critical policy terms';
      } else {
        changes.changeType = 'FORMATTING_ONLY';
        changes.description = 'Only formatting or insignificant changes detected';
        changes.skipNotification = true; // Flag to skip email notifications
      }
    }

    return changes;
  }

  calculateSemanticDifference(previousContent, currentContent) {
    // Normalize both contents for comparison
    const normalizePolicyContent = (content) => {
      return content
        // Remove all whitespace variations
        .replace(/\s+/g, ' ')
        // Remove navigation breadcrumbs and menu structures
        .replace(/Help Get to know Merchant Center[\s\S]*?Merchant Center Next/gi, '')
        .replace(/Business settings Upload your products[\s\S]*?Troubleshoot 3rd party platform integrations/gi, '')
        .replace(/Upload your products[\s\S]*?Product data specifications/gi, '')
        .replace(/Add products Maintain your product data[\s\S]*?Product data specifications/gi, '')
        .replace(/Get to know Merchant Center[\s\S]*?Glossary/gi, '')
        .replace(/Policies and requirements[\s\S]*?Local inventory ads/gi, '')
        // Remove common navigation patterns
        .replace(/(?:Home|Help)\s*>\s*[\w\s>]*(?:policies?|requirements?|specifications?)/gi, '')
        .replace(/[\w\s]*>\s*[\w\s]*>\s*[\w\s]*>\s*[\w\s]*/g, '')
        // Remove dynamic/footer elements
        .replace(/Skip to main content\s*/gi, '')
        .replace(/Give feedback about this article[\s\S]*?$/gi, '')
        .replace(/Choose a section to give fee[\s\S]*?$/gi, '')
        .replace(/For subtitles in your language[\s\S]*?choose your language\./gi, '')
        .replace(/Learn more about the commonly used policy terms[\s\S]*?glossary\./gi, '')
        .replace(/Select the settings icon[\s\S]*?choose your language\./gi, '')
        .replace(/Was this helpful\?[\s\S]*?$/gi, '')
        .replace(/Need more help\?[\s\S]*?$/gi, '')
        .replace(/Post to the Help Community[\s\S]*?$/gi, '')
        .replace(/Contact us[\s\S]*?$/gi, '')
        .replace(/Tell us more and we'll help you get there[\s\S]*?$/gi, '')
        // Remove timestamps and dynamic IDs
        .replace(/\d{1,2}\/\d{1,2}\/\d{4}[\s,]*\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?/gi, '')
        .replace(/visit_id=[^&\s]+/gi, '')
        // Remove common help page elements
        .replace(/Note:\s*Starting\s+(?:on\s+)?\w+\s+\d{1,2},?\s+\d{4}/gi, 'Note: Starting [DATE]')
        .replace(/Available for[\s\S]*?only\)/gi, '')
        .replace(/Schema\.org property:[\s\S]*?$/gmi, '')
        .trim()
        .toLowerCase();
    };

    const normalizedPrevious = normalizePolicyContent(previousContent);
    const normalizedCurrent = normalizePolicyContent(currentContent);

    // If normalized content is identical, no meaningful changes
    if (normalizedPrevious === normalizedCurrent) {
      return { significantChanges: 0, isIdentical: true };
    }

    // Check if changes are only structural/navigation
    const isStructuralChange = this.isOnlyStructuralChange(previousContent, currentContent);
    if (isStructuralChange) {
      return { significantChanges: 0, isIdentical: false, isStructuralOnly: true };
    }

    // Calculate meaningful differences
    const lengthDiff = Math.abs(normalizedCurrent.length - normalizedPrevious.length);
    const wordDiff = this.calculateWordDifference(normalizedPrevious, normalizedCurrent);
    
    // Focus on policy-specific content changes
    const policyWordDiff = this.calculatePolicySpecificDifference(normalizedPrevious, normalizedCurrent);
    
    return {
      significantChanges: Math.max(lengthDiff / 20, policyWordDiff), // Reduced sensitivity
      isIdentical: false,
      lengthDiff,
      wordDiff,
      policyWordDiff
    };
  }

  calculateWordDifference(text1, text2) {
    const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 3));
    
    const added = [...words2].filter(w => !words1.has(w)).length;
    const removed = [...words1].filter(w => !words2.has(w)).length;
    
    return added + removed;
  }

  isOnlyStructuralChange(previousContent, currentContent) {
    // Extract core policy content by removing all navigation and structural elements
    const extractPolicyCore = (content) => {
      return content
        // Remove any breadcrumb patterns (anything with > separators)
        .replace(/[^.!?]*?>\s*[^.!?]*?>\s*[^.!?]*?(?=\s|$)/g, '')
        .replace(/>\s*[^.!?]*?>\s*[^.!?]*?(?=\s|$)/g, '')
        .replace(/>\s*[^.!?]*?(?=\s|$)/g, '')
        // Remove specific navigation patterns
        .replace(/Help[\s\S]*?(?:Center|Merchant)/gi, '')
        .replace(/Get to know[\s\S]*?(?:Center|Merchant)/gi, '')
        .replace(/Business settings[\s\S]*?(?:integrations|products)/gi, '')
        .replace(/Upload your products[\s\S]*?(?:spec|data)/gi, '')
        // Remove footer and help elements
        .replace(/Skip to main content/gi, '')
        .replace(/Give feedback[\s\S]*?article/gi, '')
        .replace(/Was this helpful\?/gi, '')
        .replace(/Need more help\?/gi, '')
        .replace(/Post to the Help Community/gi, '')
        .replace(/Get answers from community members/gi, '')
        .replace(/Contact us/gi, '')
        .replace(/Tell us more[\s\S]*?there/gi, '')
        // Clean up whitespace and normalize
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    };

    const prevCore = extractPolicyCore(previousContent);
    const currCore = extractPolicyCore(currentContent);
    
    // Calculate similarity ratio using word overlap
    const prevWords = new Set(prevCore.split(/\s+/).filter(w => w.length > 2));
    const currWords = new Set(currCore.split(/\s+/).filter(w => w.length > 2));
    
    const intersection = new Set([...prevWords].filter(w => currWords.has(w)));
    const union = new Set([...prevWords, ...currWords]);
    
    const similarity = union.size > 0 ? intersection.size / union.size : 0;
    
    // If core policy content is very similar (>85%), it's only structural changes
    return similarity > 0.85;
  }

  calculatePolicySpecificDifference(text1, text2) {
    // Focus on policy-relevant keywords and phrases
    const policyKeywords = [
      'required', 'prohibited', 'allowed', 'must', 'cannot', 'shall', 'will',
      'policy', 'rule', 'regulation', 'compliance', 'violation', 'restriction',
      'requirement', 'guideline', 'standard', 'criteria', 'condition',
      'effective', 'starting', 'ending', 'deadline', 'date',
      'country', 'region', 'location', 'territory',
      'advertiser', 'merchant', 'seller', 'buyer', 'customer',
      'product', 'service', 'content', 'ad', 'listing',
      'approve', 'disapprove', 'reject', 'accept', 'review',
      'fee', 'cost', 'price', 'payment', 'charge',
      'age', 'adult', 'minor', 'child', 'restriction'
    ];

    const extractPolicyRelevantContent = (text) => {
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
      return sentences.filter(sentence => {
        const lowerSentence = sentence.toLowerCase();
        return policyKeywords.some(keyword => lowerSentence.includes(keyword));
      });
    };

    const prevPolicyContent = extractPolicyRelevantContent(text1);
    const currPolicyContent = extractPolicyRelevantContent(text2);

    // Calculate differences in policy-relevant sentences
    const addedPolicySentences = currPolicyContent.filter(sentence => 
      !prevPolicyContent.some(prevSent => 
        this.sentenceSimilarity(sentence, prevSent) > 0.7
      )
    );
    
    const removedPolicySentences = prevPolicyContent.filter(sentence => 
      !currPolicyContent.some(currSent => 
        this.sentenceSimilarity(sentence, currSent) > 0.7
      )
    );

    return addedPolicySentences.length + removedPolicySentences.length;
  }

  sentenceSimilarity(str1, str2) {
    const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  containsCriticalPolicyChanges(previousContent, currentContent) {
    // Critical terms that should never be missed
    const criticalTerms = [
      // Legal/Compliance changes
      'prohibited', 'banned', 'restricted', 'violation', 'penalty',
      'required', 'mandatory', 'must comply', 'shall comply',
      'effective immediately', 'deadline', 'expires', 'terminated',
      
      // Date-specific changes
      'starting', 'beginning', 'effective', 'ending', 'until',
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
      '2024', '2025', '2026', '2027',
      
      // Policy severity
      'new requirement', 'updated requirement', 'changed requirement',
      'no longer', 'will not', 'cannot', 'must not',
      'approval required', 'certification required', 'license required',
      
      // Geographic/Scope changes
      'all countries', 'specific countries', 'region', 'territory',
      'united states', 'european union', 'australia', 'canada',
      
      // Business impact
      'fee', 'cost', 'charge', 'payment', 'price',
      'age restriction', 'adult content', 'minor', 'child',
      'gambling', 'healthcare', 'pharmaceutical', 'medical'
    ];

    // Get differences between content
    const prevSentences = previousContent.toLowerCase().split(/[.!?]+/);
    const currSentences = currentContent.toLowerCase().split(/[.!?]+/);
    
    // Find new sentences
    const newSentences = currSentences.filter(sentence => 
      sentence.trim().length > 20 && 
      !prevSentences.some(prevSent => 
        this.sentenceSimilarity(sentence, prevSent) > 0.8
      )
    );
    
    // Find removed sentences
    const removedSentences = prevSentences.filter(sentence => 
      sentence.trim().length > 20 && 
      !currSentences.some(currSent => 
        this.sentenceSimilarity(sentence, currSent) > 0.8
      )
    );
    
    // Check if any new or removed sentences contain critical terms
    const allChangedSentences = [...newSentences, ...removedSentences];
    
    return allChangedSentences.some(sentence => 
      criticalTerms.some(term => sentence.includes(term))
    );
  }

  async getAllSnapshots() {
    if (this.useMongoDb) {
      return await this.mongoStorage.getAllSnapshots();
    } else {
      await this.ensureSnapshotsDir();
      
      try {
        const files = await fs.readdir(this.snapshotsDir);
        const snapshots = [];
        
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(this.snapshotsDir, file);
            const data = await fs.readFile(filePath, 'utf8');
            snapshots.push(JSON.parse(data));
          }
        }
        
        return snapshots;
      } catch (error) {
        console.error('Error loading snapshots:', error);
        return [];
      }
    }
  }

  async migrateToMongoDB() {
    if (!this.useMongoDb) {
      console.log('⚠️ MongoDB not enabled. Set USE_MONGODB=true to migrate.');
      return;
    }

    console.log('🔄 Starting migration from files to MongoDB...');
    const migratedCount = await this.mongoStorage.migrateFromFiles(this.snapshotsDir);
    console.log(`✅ Migration completed: ${migratedCount} snapshots moved to MongoDB`);
    return migratedCount;
  }
}
