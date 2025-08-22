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

    console.log(`🔄 Changes detected for: ${currentData.title}`);
    
    // Analyze the type of change
    const changes = this.analyzeChanges(previousSnapshot, currentData);
    
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

    // Simple content length comparison
    const lengthDiff = current.content.length - previous.content.length;
    
    if (lengthDiff > 100) {
      changes.changeType = 'MAJOR_ADDITION';
      changes.description = `Significant content added (~${lengthDiff} characters)`;
    } else if (lengthDiff < -100) {
      changes.changeType = 'MAJOR_REMOVAL';
      changes.description = `Significant content removed (~${Math.abs(lengthDiff)} characters)`;
    } else {
      changes.changeType = 'MINOR_MODIFICATION';
      changes.description = 'Content modified with minor changes';
    }

    return changes;
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
