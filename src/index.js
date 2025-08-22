import { GooglePolicyDiscovery } from './crawlers/googlePolicyDiscovery.js';
import { ChangeDetector } from './analysis/changeDetector.js';
import { EmailService } from './notifications/emailService.js';
import { AIAnalyzer } from './analysis/aiAnalyzer.js';
import fs from 'fs/promises';
import path from 'path';

class PolicyMonitor {
  constructor() {
    this.discovery = new GooglePolicyDiscovery();
    this.changeDetector = new ChangeDetector();
    this.emailService = new EmailService();
    this.aiAnalyzer = new AIAnalyzer();
    this.results = [];
  }

  async initialize() {
    console.log('🚀 Initializing Google Ads Policy Monitor...');
    await this.discovery.initialize();
  }

  async loadPolicyUrls() {
    // Check environment variable to force full config in production
    const useFullConfig = process.env.USE_FULL_CONFIG === 'true';
    const testConfigPath = path.join(process.cwd(), 'config', 'policy-urls-test.json');
    const fullConfigPath = path.join(process.cwd(), 'config', 'policy-urls.json');
    
    let configPath = fullConfigPath;
    
    if (!useFullConfig) {
      try {
        await fs.access(testConfigPath);
        configPath = testConfigPath;
        console.log('📋 Using test configuration with limited URLs');
      } catch {
        console.log('📋 Using full configuration');
      }
    } else {
      console.log('📋 Using full configuration (forced by USE_FULL_CONFIG=true)');
    }

    try {
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const urls = [];
      
      const extractUrls = (obj) => {
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'string' && value.startsWith('http')) {
            urls.push(value);
          } else if (typeof value === 'object' && value !== null) {
            extractUrls(value);
          }
        }
      };
      
      extractUrls(config.googleAds);
      return urls;
    } catch (error) {
      console.error('❌ Error loading policy URLs:', error);
      // Fallback to hardcoded URLs
      return [
        'https://support.google.com/publisherpolicies/answer/10502938',
        'https://support.google.com/publisherpolicies/answer/10400453',
        'https://support.google.com/publisherpolicies/topic/10400854'
      ];
    }
  }

  async monitorPolicies() {
    console.log('📋 Starting policy monitoring...');
    
    const policyUrls = await this.loadPolicyUrls();
    console.log(`🔍 Monitoring ${policyUrls.length} policy URLs`);

    for (const url of policyUrls) {
      try {
        console.log(`\n📄 Processing: ${url}`);
        
        // Extract current content
        const currentData = await this.discovery.extractPolicyContent(url);
        if (!currentData) {
          console.log(`⚠️ Failed to extract content from: ${url}`);
          continue;
        }

        // Detect changes
        const changeResult = await this.changeDetector.detectChanges(currentData);
        
        let complianceAnalysis = null;
        
        // Only analyze with Crawl5 if changes were detected
        if (changeResult.hasChanges || changeResult.isNew) {
          console.log('🔍 Analyzing policy content with Crawl5...');
          complianceAnalysis = await this.aiAnalyzer.analyzePolicyForCrawl5(currentData.content, url);
          
          // Save current snapshot only when changes are detected
          await this.changeDetector.saveSnapshot(currentData);
        } else {
          console.log('📋 Using existing snapshot as baseline - no update needed');
        }

        // Store result with compliance analysis
        const result = {
          url,
          ...changeResult,
          complianceAnalysis
        };
        this.results.push(result);

        // Send immediate alert ONLY for content changes, NOT for new pages
        if (changeResult.hasChanges && !changeResult.isNew) {
          console.log('🚨 Sending change alert...');
          
          // Enhance change data with detailed compliance insights
          const enhancedChanges = {
            ...changeResult.changes,
            complianceAnalysis: complianceAnalysis,
            crawl5UpdatesNeeded: complianceAnalysis?.crawl5_updates_needed?.length || 0,
            // Add detailed compliance data from Crawl5
            impactLevel: complianceAnalysis?.impact_level || 'UNKNOWN',
            complianceSummary: complianceAnalysis?.summary || 'No analysis available',
            affectedViolations: complianceAnalysis?.affectedViolations || [],
            recommendedActions: complianceAnalysis?.recommendedActions || {},
            businessImpact: complianceAnalysis?.businessImpact || {},
            contentAnalysis: complianceAnalysis?.contentAnalysis || {},
            // Include previous and current content for comparison
            previousContent: changeResult.previousSnapshot?.content || '',
            currentContent: currentData.content || ''
          };

          await this.emailService.sendPolicyChangeAlert(enhancedChanges);
        } else if (changeResult.isNew) {
          console.log('📝 New policy detected - added to monitoring (no email sent)');
        }

        // Add delay between requests to be respectful
        await this.delay(2000);

      } catch (error) {
        console.error(`❌ Error processing ${url}:`, error);
      }
    }
  }

  async discoverNewPolicies() {
    console.log('\n🔍 Discovering new policy URLs...');
    
    const hubUrl = 'https://support.google.com/publisherpolicies/topic/10400854';
    const discoveredUrls = await this.discovery.discoverPolicyUrls(hubUrl);
    
    // Load existing URLs
    const existingUrls = await this.loadPolicyUrls();
    const newUrls = discoveredUrls.filter(url => !existingUrls.includes(url));
    
    if (newUrls.length > 0) {
      console.log(`🆕 Found ${newUrls.length} new policy URLs:`);
      newUrls.forEach(url => console.log(`  - ${url}`));
      
      // TODO: Automatically add to config or send notification about new URLs
      return newUrls;
    } else {
      console.log('✅ No new policy URLs discovered');
      return [];
    }
  }

  async generateReport() {
    console.log('\n📊 Generating monitoring report...');
    
    const totalChecked = this.results.length;
    const changesDetected = this.results.filter(r => r.hasChanges || r.isNew).length;
    const newPolicies = this.results.filter(r => r.isNew).length;
    const modifiedPolicies = this.results.filter(r => r.hasChanges).length;

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalChecked,
        changesDetected,
        newPolicies,
        modifiedPolicies
      },
      results: this.results
    };

    // Save report
    const reportsDir = path.join(process.cwd(), 'data', 'reports');
    await fs.mkdir(reportsDir, { recursive: true });
    
    const reportPath = path.join(reportsDir, `report-${new Date().toISOString().split('T')[0]}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`📋 Report saved: ${reportPath}`);
    // Add compliance summary
    const criticalIssues = this.results.filter(r => 
      r.complianceAnalysis?.impact_level === 'CRITICAL').length;
    const highIssues = this.results.filter(r => 
      r.complianceAnalysis?.impact_level === 'HIGH').length;
    
    console.log(`📊 Summary: ${totalChecked} checked, ${changesDetected} changes detected`);
    console.log(`🔍 Compliance: ${criticalIssues} critical, ${highIssues} high impact issues`);

    // Enhanced report with compliance data
    report.compliance = {
      criticalIssues,
      highIssues,
      totalCrawl5Updates: this.results.reduce((sum, r) => 
        sum + (r.complianceAnalysis?.crawl5_updates_needed?.length || 0), 0)
    };

    return report;
  }

  async sendDailySummary() {
    console.log('\n📧 Sending daily summary...');
    await this.emailService.sendDailySummary(this.results);
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    try {
      // Close Playwright browser
      await this.discovery.close();
      
      // Close MongoDB connection if using MongoDB
      if (this.changeDetector.useMongoDb && this.changeDetector.mongoStorage.isConnected) {
        await this.changeDetector.mongoStorage.disconnect();
      }
      
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('⚠️ Cleanup error:', error);
    }
    
    // Force exit to ensure process terminates
    setTimeout(() => {
      console.log('🔄 Forcing process exit...');
      process.exit(0);
    }, 2000);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const monitor = new PolicyMonitor();
  
  try {
    await monitor.initialize();
    
    // Monitor existing policies (324 URLs from policy-urls.json)
    await monitor.monitorPolicies();
    
    // Generate report
    await monitor.generateReport();
    
    // Send daily summary
    await monitor.sendDailySummary();
    
    console.log('\n✅ Policy monitoring completed successfully');
    
  } catch (error) {
    console.error('❌ Policy monitoring failed:', error);
    console.log('🔄 Continuing with cleanup...');
  } finally {
    await monitor.cleanup();
  }
}

// Export the PolicyMonitor class for use in other modules
export { PolicyMonitor };

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
