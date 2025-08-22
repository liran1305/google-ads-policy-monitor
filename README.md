# Google Ads Policy Monitor

Automated monitoring system for Google Ads policy changes with email notifications.

## Features

- 🔍 **Automated Discovery**: Finds all Google Ads policy pages automatically
- 📄 **Content Extraction**: Extracts and monitors policy content changes
- 🔄 **Change Detection**: Compares content using hashing and AI analysis
- 📧 **Email Alerts**: Immediate notifications for policy changes
- 📊 **Daily Reports**: Comprehensive monitoring summaries
- ⏰ **Scheduled Execution**: Runs daily via GitHub Actions

## Quick Start

### 1. Setup Environment

```bash
# Clone and install
cd policy-monitor
npm install

# Copy environment template
cp .env.example .env
```

### 2. Configure Email Settings

Edit `.env` with your email credentials:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
ALERT_EMAIL=your-alert-email@gmail.com
FROM_EMAIL=policy-monitor@yourdomain.com
```

**For Gmail**: Use an [App Password](https://support.google.com/accounts/answer/185833) instead of your regular password.

### 3. Run Locally

```bash
# Test the monitor
npm run monitor

# Or run directly
node src/index.js
```

### 4. Deploy with GitHub Actions

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial policy monitor setup"
   git remote add origin https://github.com/yourusername/policy-monitor.git
   git push -u origin main
   ```

2. **Add GitHub Secrets**:
   Go to your repo → Settings → Secrets and variables → Actions

   Add these secrets:
   - `SMTP_HOST`
   - `SMTP_PORT` 
   - `SMTP_USER`
   - `SMTP_PASS`
   - `ALERT_EMAIL`
   - `FROM_EMAIL`
   - `GEMINI_API_KEY` (optional, for AI analysis)

3. **Enable Actions**: The workflow runs daily at 9 AM UTC automatically.

## How It Works

### 1. Policy Discovery
- Crawls Google's policy hub to find all policy URLs
- Automatically discovers new policies as they're added

### 2. Content Monitoring
- Extracts full content from each policy page
- Generates content hashes for change detection
- Stores snapshots for historical comparison

### 3. Change Detection
- Compares current content with previous snapshots
- Categorizes changes: NEW, MAJOR_ADDITION, MAJOR_REMOVAL, MINOR_MODIFICATION
- Uses content length and hash comparison

### 4. Notifications
- Sends immediate email alerts for any changes
- Includes change type, description, and direct links
- Daily summary reports with all monitoring results

## Monitored Policies

Currently monitors these Google Ads policy areas:

- **Content Policies**: Prohibited content types
- **Behavioral Policies**: Click fraud, invalid traffic
- **Privacy Policies**: Data collection, user consent
- **Technical Requirements**: Site quality, user experience

## File Structure

```
policy-monitor/
├── src/
│   ├── crawlers/           # Web scraping logic
│   ├── analysis/           # Change detection
│   ├── notifications/      # Email alerts
│   └── index.js           # Main orchestrator
├── config/
│   └── policy-urls.json   # Monitored URLs
├── data/
│   ├── snapshots/         # Policy version history
│   └── reports/           # Daily monitoring reports
└── .github/workflows/     # GitHub Actions automation
```

## Customization

### Add New Policy URLs

Edit `config/policy-urls.json`:

```json
{
  "googleAds": {
    "newPolicy": "https://support.google.com/publisherpolicies/answer/NEW_ID"
  }
}
```

### Change Monitoring Schedule

Edit `.github/workflows/daily-policy-check.yml`:

```yaml
on:
  schedule:
    - cron: '0 6 * * *'  # 6 AM UTC instead of 9 AM
```

### Customize Email Templates

Modify `src/notifications/emailService.js` to change email formatting and content.

## Troubleshooting

### Common Issues

1. **Email not sending**: Check SMTP credentials and Gmail app password
2. **Puppeteer errors**: GitHub Actions includes Chrome automatically
3. **Rate limiting**: Built-in 2-second delays between requests

### Debug Mode

Run with debug output:

```bash
DEBUG=* npm run monitor
```

### Manual Testing

Test individual components:

```bash
# Test email service
node -e "
import { EmailService } from './src/notifications/emailService.js';
const email = new EmailService();
email.sendPolicyChangeAlert({
  title: 'Test Policy',
  changeType: 'MINOR_MODIFICATION',
  description: 'Test change',
  url: 'https://example.com',
  detectedAt: new Date().toISOString()
});
"
```

## Security

- All sensitive credentials stored as GitHub Secrets
- No API keys or passwords in code
- Respects robots.txt and rate limits
- Uses official Google support URLs only

## License

ISC License - Free for commercial and personal use.
