# Google Ads Policy Monitor

A comprehensive monitoring system for tracking changes in Google Ads policies with AI-powered compliance analysis using Crawl5 backend integration.

## 🎯 Overview

This system continuously monitors Google Ads policy pages, detects changes, and provides intelligent compliance analysis to help businesses stay up-to-date with policy modifications that could impact their advertising campaigns.

## 🏗️ Architecture

### Core Components

1. **Policy Discovery** (`src/crawlers/googlePolicyDiscovery.js`)
   - Web scraping using Puppeteer and Cheerio
   - Content extraction and normalization
   - Hash-based change detection

2. **Change Detection** (`src/analysis/changeDetector.js`)
   - Hybrid storage system (File-based + MongoDB)
   - Content hash comparison for efficient change detection
   - Snapshot management with upsert logic

3. **AI Analysis** (`src/analysis/aiAnalyzer.js`)
   - Crawl5 backend integration for compliance analysis
   - Fallback to local Gemini API
   - Rate limiting and error handling

4. **Email Notifications** (`src/notifications/emailService.js`)
   - SMTP-based email alerts
   - HTML and text email templates
   - Graceful error handling

5. **MongoDB Storage** (`src/storage/mongoStorage.js`)
   - Production-ready database storage
   - Automatic document replacement (upsert)
   - Migration utilities

## 📊 Data Structures

### Policy Snapshot Document

```javascript
{
  _id: ObjectId("..."),                    // MongoDB document ID
  url: "https://support.google.com/...",  // Unique policy URL
  title: "Policy Title",                  // Extracted page title
  content: "Full HTML content...",        // Complete policy text
  contentHash: "abc123",                  // Short hash for comparison
  lastModified: "2025-01-22T12:00:00Z",  // Page last modified timestamp
  extractedAt: "2025-01-22T12:00:00Z",   // When content was scraped
  snapshotDate: "2025-01-22T12:00:00Z",  // Snapshot creation time
  updatedAt: Date("2025-01-22T12:00:00Z") // MongoDB update timestamp
}
```

### Crawl5 Analysis Response

```javascript
{
  success: true,
  analysis: {
    has_significant_changes: true,
    impact_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
    summary: "Description of changes detected",
    severity: "critical" | "high" | "medium" | "low",
    complianceImpact: {
      new_violations_to_detect: ["Policy enforcement changes"],
      enforcement_severity_changes: ["Significant policy updates"],
      detection_pattern_updates: []
    },
    affectedViolations: [],
    recommendedActions: {
      immediate: ["Review policy changes immediately"],
      short_term: ["Update compliance scanning"],
      monitoring: ["Continue monitoring for related changes"]
    },
    businessImpact: {
      affected_industries: ["General"],
      risk_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      customer_action_required: true | false
    },
    contentAnalysis: {
      length_change: 1234,
      change_percentage: 15.5,
      critical_keywords_found: true | false
    }
  },
  analyzedAt: "2025-01-22T12:00:00Z",
  source: "crawl5-compliance-engine"
}
```

### Change Detection Result

```javascript
{
  isNew: false,                    // True for newly discovered policies
  hasChanges: true,                // True when content hash differs
  changes: {
    type: "CONTENT_MODIFIED",      // Change type classification
    changeType: "MAJOR_ADDITION",  // Specific change category
    url: "https://...",            // Policy URL
    title: "Policy Title",         // Page title
    description: "Change summary", // Human-readable description
    detectedAt: "2025-01-22T12:00:00Z",
    previousHash: "old123",        // Previous content hash
    currentHash: "new456",         // Current content hash
    complianceAnalysis: { ... }    // Crawl5 analysis results
  },
  previousSnapshot: { ... },       // Previous policy snapshot
  currentData: { ... }            // Current policy data
}
```

## 🚀 Installation & Setup

### Prerequisites

- Node.js 18+
- MongoDB (for production)
- Gmail account with App Password (for email alerts)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd policy-monitor

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
```

### Environment Configuration

```bash
# Email Configuration
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
ALERT_EMAIL="alerts@company.com"
FROM_EMAIL="Policy Monitor <monitor@company.com>"

# API Keys
GEMINI_API_KEY="your-gemini-api-key"
CRAWL5_API_KEY="your-crawl5-api-key"
CRAWL5_API_URL="http://localhost:4000"

# MongoDB (Production)
USE_MONGODB=false
MONGODB_URL="mongodb://localhost:27017"
MONGODB_DB_NAME="policy_monitor"
```

## 🎮 Usage

### Development Mode (File Storage)

```bash
# Monitor with test configuration (5 URLs)
npm run monitor

# Monitor with full configuration (300+ URLs)
# Remove config/policy-urls-test.json first
npm run monitor
```

### Production Mode (MongoDB)

```bash
# Enable MongoDB in .env
USE_MONGODB=true

# Migrate existing snapshots to MongoDB
node scripts/migrate-to-mongo.js

# Run monitoring
npm run monitor
```

## 📁 Project Structure

```
policy-monitor/
├── src/
│   ├── analysis/
│   │   ├── aiAnalyzer.js          # Crawl5 & Gemini integration
│   │   └── changeDetector.js      # Change detection logic
│   ├── crawlers/
│   │   └── googlePolicyDiscovery.js # Web scraping
│   ├── notifications/
│   │   └── emailService.js        # Email alerts
│   ├── prompts/
│   │   └── crawl5Compliance.js    # AI prompts
│   ├── storage/
│   │   └── mongoStorage.js        # MongoDB operations
│   └── index.js                   # Main application
├── config/
│   ├── policy-urls.json           # Full URL configuration
│   └── policy-urls-test.json      # Test configuration (5 URLs)
├── data/
│   ├── reports/                   # Daily monitoring reports
│   └── snapshots/                 # File-based snapshots
├── scripts/
│   └── migrate-to-mongo.js        # Migration utility
├── .github/workflows/
│   └── daily-policy-check.yml     # GitHub Actions workflow
└── package.json
```

## 🔄 Workflow

1. **Policy Discovery**: Load URLs from configuration file
2. **Content Extraction**: Scrape policy pages using Puppeteer
3. **Change Detection**: Compare content hashes with stored snapshots
4. **AI Analysis**: Send changed content to Crawl5 for compliance analysis
5. **Storage**: Update snapshots with new content (file or MongoDB)
6. **Notifications**: Send email alerts for significant changes
7. **Reporting**: Generate daily monitoring reports

## 🛠️ Configuration Files

### Policy URLs (`config/policy-urls.json`)

```javascript
{
  "googleAds": {
    "prohibited_content": {
      "counterfeit_goods": "https://support.google.com/adspolicy/answer/176017",
      "dangerous_products": "https://support.google.com/adspolicy/answer/6014299"
    },
    "prohibited_practices": {
      "misrepresentation": "https://support.google.com/adspolicy/answer/6020955"
    }
  }
}
```

### Test Configuration (`config/policy-urls-test.json`)

Smaller subset with 5 key policies for development and testing.

## 🔧 Features

### Smart Configuration Detection
- Automatically uses test config if available
- Falls back to full configuration for production

### Hybrid Storage System
- **Development**: File-based JSON storage
- **Production**: MongoDB with upsert logic

### Intelligent Change Detection
- Hash-based comparison for efficiency
- Only analyzes changed content with Crawl5
- Prevents unnecessary API calls and rate limiting

### Robust Error Handling
- Graceful email authentication failures
- Crawl5 backend fallback to local analysis
- Comprehensive logging and debugging

### Rate Limiting Protection
- Built-in delays between requests
- Conditional analysis only when changes detected
- Retry logic for failed requests

## 📈 Monitoring & Analytics

### Daily Reports
- Stored in `data/reports/report-YYYY-MM-DD.json`
- Summary statistics and change details
- Compliance analysis results

### MongoDB Analytics
```javascript
// Get snapshot statistics
const stats = await mongoStorage.getSnapshotStats();
// Returns: { total: 324, recentlyUpdated: 12 }
```

## 🚀 Deployment

### GitHub Actions
Automated daily monitoring with environment variables:
- Runs on schedule or manual trigger
- Supports all environment configurations
- Includes error handling and notifications

### Production Checklist
1. ✅ Set up MongoDB instance
2. ✅ Configure environment variables
3. ✅ Migrate existing snapshots
4. ✅ Test email notifications
5. ✅ Verify Crawl5 backend connectivity
6. ✅ Set up monitoring schedule

## 🔍 Troubleshooting

### Common Issues

**Email Authentication Failed**
- Ensure Gmail 2FA is enabled
- Generate App Password (not regular password)
- Check SMTP credentials in .env

**Crawl5 Backend Errors**
- Verify API key is valid
- Check backend is running on correct port
- Review rate limiting settings

**MongoDB Connection Issues**
- Confirm MongoDB is running
- Check connection string format
- Verify database permissions

### Debug Mode
Enable detailed logging by checking console output for:
- 🔍 Debug information
- ⚠️ Warnings and fallbacks
- ❌ Error details with context

## 📊 Performance

### Optimization Features
- Content hash comparison (fast)
- Conditional AI analysis (efficient)
- Connection pooling (MongoDB)
- Request rate limiting (respectful)

### Scalability
- Supports 300+ policy URLs
- Efficient change detection
- Horizontal scaling ready
- Database indexing optimized

## 🔐 Security

### Best Practices
- Environment variable configuration
- API key masking in logs
- Secure SMTP authentication
- Database connection encryption

### Data Privacy
- No sensitive user data stored
- Policy content only (public information)
- Secure credential management
- Audit trail in MongoDB

---

## 📞 Support

For issues or questions:
1. Check troubleshooting section
2. Review console logs for errors
3. Verify environment configuration
4. Test with minimal configuration first

**System Status**: ✅ Production Ready
**Last Updated**: 2025-01-22
**Version**: 1.0.0
