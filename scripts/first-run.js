#!/usr/bin/env node

import { PolicyMonitor } from '../src/index.js';
import { MongoStorage } from '../src/storage/mongoStorage.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * First-run initialization script
 * - Creates baseline snapshots for all policies
 * - Removes dead/404 URLs from configuration
 * - No email alerts sent during initialization
 */

class FirstRunInitializer {
  constructor() {
    this.monitor = new PolicyMonitor();
    this.validUrls = [];
    this.deadUrls = [];
    this.mongoStorage = new MongoStorage();
  }

  async initialize() {
    console.log('🚀 Starting first-run initialization...');
    await this.monitor.initialize();
    
    if (process.env.USE_MONGODB === 'true') {
      await this.mongoStorage.connect();
    }
  }

  async validateAndCreateBaselines() {
    const urls = await this.monitor.loadPolicyUrls();
    console.log(`📋 Validating ${urls.length} policy URLs...`);

    for (const url of urls) {
      try {
        console.log(`📄 Checking: ${url}`);
        
        // Extract content to validate URL
        const currentData = await this.monitor.discovery.extractPolicyContent(url);
        
        if (!currentData.content || currentData.content.trim().length === 0) {
          console.log(`❌ Dead URL detected (no content): ${url}`);
          this.deadUrls.push(url);
          continue;
        }

        // Check for Google's "page can't be found" patterns
        const content = currentData.content.toLowerCase();
        const pageNotFoundPatterns = [
          'sorry, this page can\'t be found',
          'page can\'t be found',
          'sorry, we couldn\'t find that page',
          'the page you\'re looking for isn\'t available',
          '404',
          'page not found'
        ];

        const isPageNotFound = pageNotFoundPatterns.some(pattern => 
          content.includes(pattern)
        );

        if (isPageNotFound) {
          console.log(`❌ Dead URL detected (page not found): ${url}`);
          this.deadUrls.push(url);
          continue;
        }

        // URL is valid, create baseline snapshot
        this.validUrls.push(url);
        
        // Save snapshot without triggering analysis or emails
        await this.monitor.changeDetector.saveSnapshot(url, currentData);
        console.log(`✅ Baseline created for: ${currentData.title}`);
        
        // Add delay to be respectful
        await this.delay(1000);
        
      } catch (error) {
        console.log(`❌ Error with URL ${url}: ${error.message}`);
        this.deadUrls.push(url);
      }
    }
  }

  async updateConfiguration() {
    if (this.deadUrls.length === 0) {
      console.log('✅ No dead URLs found - configuration is clean');
      return;
    }

    console.log(`🧹 Found ${this.deadUrls.length} dead URLs to remove:`);
    this.deadUrls.forEach(url => console.log(`  - ${url}`));

    // Read current configuration
    const configPath = path.join(process.cwd(), 'config', 'policy-urls.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

    // Remove dead URLs from configuration
    const removeDeadUrls = (obj) => {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && this.deadUrls.includes(value)) {
          delete obj[key];
          console.log(`🗑️ Removed dead URL: ${key}`);
        } else if (typeof value === 'object' && value !== null) {
          removeDeadUrls(value);
        }
      }
    };

    removeDeadUrls(config.googleAds);

    // Save updated configuration
    const backupPath = `${configPath}.backup.${Date.now()}`;
    await fs.copyFile(configPath, backupPath);
    console.log(`💾 Backup saved: ${backupPath}`);

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(`✅ Updated configuration saved`);
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalUrls: this.validUrls.length + this.deadUrls.length,
      validUrls: this.validUrls.length,
      deadUrls: this.deadUrls.length,
      deadUrlsList: this.deadUrls,
      status: 'initialization_complete'
    };

    const reportPath = path.join(process.cwd(), 'data', 'reports', `first-run-${new Date().toISOString().split('T')[0]}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`📊 First-run report saved: ${reportPath}`);

    return report;
  }

  async cleanup() {
    if (this.mongoStorage.isConnected) {
      await this.mongoStorage.disconnect();
    }
    await this.monitor.cleanup();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const initializer = new FirstRunInitializer();
  
  try {
    await initializer.initialize();
    await initializer.validateAndCreateBaselines();
    await initializer.updateConfiguration();
    const report = await initializer.generateReport();
    
    console.log('\n🎉 First-run initialization completed successfully!');
    console.log(`📊 Summary: ${report.validUrls} valid URLs, ${report.deadUrls} dead URLs removed`);
    console.log('🚀 You can now run regular monitoring with: npm run monitor');
    
  } catch (error) {
    console.error('❌ First-run initialization failed:', error);
    process.exit(1);
  } finally {
    await initializer.cleanup();
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { FirstRunInitializer };
