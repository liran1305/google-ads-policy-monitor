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
    
    // If only formatting changes, don't treat as meaningful change
    if (changes.skipNotification) {
      console.log(`⚪ Only formatting changes detected for: ${currentData.title} - skipping notification`);
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
    
    if (semanticDiff.significantChanges > 50) {
      changes.changeType = 'MAJOR_ADDITION';
      changes.description = `Significant policy changes detected (${semanticDiff.significantChanges} meaningful changes)`;
    } else if (semanticDiff.significantChanges > 20) {
      changes.changeType = 'MODERATE_CHANGE';
      changes.description = `Moderate policy updates detected (${semanticDiff.significantChanges} changes)`;
    } else if (semanticDiff.significantChanges > 5) {
      changes.changeType = 'MINOR_MODIFICATION';
      changes.description = `Minor policy modifications detected (${semanticDiff.significantChanges} changes)`;
    } else {
      // Very few meaningful changes - likely formatting/whitespace only
      changes.changeType = 'FORMATTING_ONLY';
      changes.description = 'Only formatting or insignificant changes detected';
      changes.skipNotification = true; // Flag to skip email notifications
    }

    return changes;
  }

  calculateSemanticDifference(previousContent, currentContent) {
    // Normalize both contents for comparison
    const normalizePolicyContent = (content) => {
      return content
        // Remove all whitespace variations
        .replace(/\s+/g, ' ')
        // Remove dynamic/navigation elements
        .replace(/Skip to main content\s*/gi, '')
        .replace(/Give feedback about this article[\s\S]*?$/gi, '')
        .replace(/Choose a section to give fee[\s\S]*?$/gi, '')
        .replace(/For subtitles in your language[\s\S]*?choose your language\./gi, '')
        .replace(/Learn more about the commonly used policy terms[\s\S]*?glossary\./gi, '')
        .replace(/Select the settings icon[\s\S]*?choose your language\./gi, '')
        // Remove timestamps and dynamic IDs
        .replace(/\d{1,2}\/\d{1,2}\/\d{4}[\s,]*\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?/gi, '')
        .replace(/visit_id=[^&\s]+/gi, '')
        .trim()
        .toLowerCase();
    };

    const normalizedPrevious = normalizePolicyContent(previousContent);
    const normalizedCurrent = normalizePolicyContent(currentContent);

    // If normalized content is identical, no meaningful changes
    if (normalizedPrevious === normalizedCurrent) {
      return { significantChanges: 0, isIdentical: true };
    }

    // Calculate meaningful differences
    const lengthDiff = Math.abs(normalizedCurrent.length - normalizedPrevious.length);
    const wordDiff = this.calculateWordDifference(normalizedPrevious, normalizedCurrent);
    
    return {
      significantChanges: Math.max(lengthDiff / 10, wordDiff),
      isIdentical: false,
      lengthDiff,
      wordDiff
    };
  }

  calculateWordDifference(text1, text2) {
    const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 3));
    
    const added = [...words2].filter(w => !words1.has(w)).length;
    const removed = [...words1].filter(w => !words2.has(w)).length;
    
    return added + removed;
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
