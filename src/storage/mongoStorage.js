import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

export class MongoStorage {
  constructor() {
    this.client = null;
    this.db = null;
    this.collection = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      const mongoUrl = process.env.MONGODB_URL;
      const dbName = process.env.MONGODB_DB_NAME || 'policy_monitor';
      
      if (!mongoUrl) {
        console.warn('⚠️ MONGODB_URL not provided, MongoDB features disabled');
        this.isConnected = false;
        return false;
      }
      
      this.client = new MongoClient(mongoUrl);
      await this.client.connect();
      this.db = this.client.db(dbName);
      this.collection = this.db.collection('policy_snapshots');
      this.isConnected = true;
      
      console.log('📊 Connected to MongoDB successfully');
      
      // Create index on URL for faster queries
      await this.collection.createIndex({ url: 1 }, { unique: true });
      return true;
      
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      console.warn('⚠️ Falling back to file-based storage');
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('📊 Disconnected from MongoDB');
    }
  }

  async saveSnapshot(policyData) {
    if (!this.isConnected) {
      await this.connect();
    }

    const snapshot = {
      url: policyData.url,
      title: policyData.title,
      content: policyData.content,
      contentHash: policyData.contentHash,
      lastModified: policyData.lastModified,
      extractedAt: policyData.extractedAt,
      snapshotDate: new Date().toISOString(),
      updatedAt: new Date()
    };

    try {
      // Use upsert to replace existing document or create new one
      const result = await this.collection.replaceOne(
        { url: policyData.url }, // Filter by URL
        snapshot, // Replace with new snapshot
        { upsert: true } // Create if doesn't exist
      );

      if (result.upsertedCount > 0) {
        console.log(`💾 Created new snapshot in MongoDB for: ${policyData.url}`);
      } else if (result.modifiedCount > 0) {
        console.log(`💾 Updated existing snapshot in MongoDB for: ${policyData.url}`);
      } else {
        console.log(`💾 No changes needed for snapshot: ${policyData.url}`);
      }

      return result;
    } catch (error) {
      console.error('❌ Error saving snapshot to MongoDB:', error);
      throw error;
    }
  }

  async loadPreviousSnapshot(url) {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const snapshot = await this.collection.findOne({ url: url });
      return snapshot;
    } catch (error) {
      console.error('❌ Error loading snapshot from MongoDB:', error);
      return null;
    }
  }

  async getAllSnapshots() {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const snapshots = await this.collection.find({}).toArray();
      return snapshots;
    } catch (error) {
      console.error('❌ Error loading all snapshots from MongoDB:', error);
      return [];
    }
  }

  async getSnapshotStats() {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const totalCount = await this.collection.countDocuments();
      const recentCount = await this.collection.countDocuments({
        updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      });

      return {
        total: totalCount,
        recentlyUpdated: recentCount
      };
    } catch (error) {
      console.error('❌ Error getting snapshot stats:', error);
      return { total: 0, recentlyUpdated: 0 };
    }
  }

  // Migration method to move existing file snapshots to MongoDB
  async migrateFromFiles(snapshotsDir = './data/snapshots') {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const files = await fs.readdir(snapshotsDir);
      let migratedCount = 0;

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(snapshotsDir, file);
          const data = await fs.readFile(filePath, 'utf8');
          const snapshot = JSON.parse(data);
          
          await this.saveSnapshot(snapshot);
          migratedCount++;
        }
      }

      console.log(`📊 Migrated ${migratedCount} snapshots from files to MongoDB`);
      return migratedCount;
    } catch (error) {
      console.error('❌ Error migrating snapshots:', error);
      throw error;
    }
  }
}
