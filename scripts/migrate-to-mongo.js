#!/usr/bin/env node

import { ChangeDetector } from '../src/analysis/changeDetector.js';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  console.log('🔄 Starting migration from file storage to MongoDB...');
  
  // Temporarily enable MongoDB for migration
  process.env.USE_MONGODB = 'true';
  
  const changeDetector = new ChangeDetector();
  
  try {
    const migratedCount = await changeDetector.migrateToMongoDB();
    console.log(`✅ Successfully migrated ${migratedCount} snapshots to MongoDB`);
    
    // Show stats
    const stats = await changeDetector.mongoStorage.getSnapshotStats();
    console.log(`📊 MongoDB now contains ${stats.total} policy snapshots`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
