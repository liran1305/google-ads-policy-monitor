import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

export class EmailService {
  constructor() {
    this.transporter = null;
    this.initialize();
  }

  async initialize() {
    // Skip email initialization if not configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.ALERT_EMAIL) {
      console.log('⚠️ Email service not configured - email alerts disabled');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // Verify connection
    try {
      await this.transporter.verify();
      console.log('📧 Email service initialized successfully');
    } catch (error) {
      console.log('⚠️ Email service authentication failed - email alerts disabled');
      console.log('💡 To fix: Check your Gmail app password or disable 2FA verification');
      this.transporter = null; // Disable email functionality
    }
  }

  async sendPolicyChangeAlert(changes) {
    // Check if email is configured and transporter is available
    if (!process.env.ALERT_EMAIL || !this.transporter) {
      console.log('⚠️ Email alerts not configured - skipping email notification');
      console.log('📧 To enable email alerts, fix Gmail authentication in your .env file');
      return;
    }

    const subject = this.generateSubject(changes);
    const htmlContent = this.generateHtmlContent(changes);
    const textContent = this.generateTextContent(changes);

    const mailOptions = {
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: process.env.ALERT_EMAIL,
      subject,
      text: textContent,
      html: htmlContent
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`📧 Alert sent successfully: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email alert:', error);
      return false;
    }
  }

  generateSubject(changes) {
    const { changeType, title } = changes;
    
    const urgencyMap = {
      'NEW_POLICY': '🆕 NEW',
      'MAJOR_ADDITION': '🚨 MAJOR',
      'MAJOR_REMOVAL': '⚠️ MAJOR',
      'MINOR_MODIFICATION': '📝 UPDATE'
    };

    const urgency = urgencyMap[changeType] || '📝 UPDATE';
    return `${urgency} Google Ads Policy Change: ${title}`;
  }

  generateHtmlContent(changes) {
    const { 
      url, 
      title, 
      description, 
      changeType = 'POLICY_UPDATE',
      previousContent,
      currentContent,
      specificChanges, 
      detectedAt, 
      complianceAnalysis, 
      crawl5UpdatesNeeded 
    } = changes;
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #4285f4; color: white; padding: 20px; border-radius: 5px; }
            .content { padding: 20px; }
            .change-type { 
                display: inline-block; 
                padding: 5px 10px; 
                border-radius: 3px; 
                font-weight: bold;
                margin: 10px 0;
            }
            .major { background: #ff4444; color: white; }
            .minor { background: #44ff44; color: black; }
            .new { background: #4444ff; color: white; }
            .footer { margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 3px; }
            .url { word-break: break-all; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🔔 Google Ads Policy Change Detected</h1>
        </div>
        
        <div class="content">
            <h2>${title}</h2>
            
            <div class="change-type ${this.getChangeClass(changeType)}">
                ${changeType.replace('_', ' ')}
            </div>
            
            <p><strong>Description:</strong> ${description}</p>
            
            <p><strong>Policy URL:</strong><br>
            <a href="${url}" class="url">${url}</a></p>
            
            <p><strong>Detected At:</strong> ${new Date(detectedAt).toLocaleString()}</p>
            
            ${specificChanges ? `
            <div style="background: #fff3cd; padding: 15px; border: 1px solid #ffeaa7; border-radius: 5px; margin: 15px 0;">
                <h3>📝 Specific Changes Detected</h3>
                <ul>
                ${specificChanges.map(change => `<li><strong>${change.section}:</strong> ${change.description}</li>`).join('')}
                </ul>
            </div>
            ` : ''}
            
            ${previousContent && currentContent ? `
            <div style="background: #f8f9fa; padding: 15px; border: 1px solid #dee2e6; border-radius: 5px; margin: 15px 0;">
                <h3>🔍 Content Comparison</h3>
                
                <div style="margin-bottom: 15px;">
                    <h4 style="color: #dc3545;">❌ Previous Content (Removed/Changed)</h4>
                    <div style="background: #f8d7da; padding: 10px; border-radius: 3px; font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: auto;">
                        ${this.escapeHtml(previousContent.substring(0, 500))}${previousContent.length > 500 ? '...' : ''}
                    </div>
                </div>
                
                <div>
                    <h4 style="color: #28a745;">✅ Current Content (Added/Updated)</h4>
                    <div style="background: #d4edda; padding: 10px; border-radius: 3px; font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: auto;">
                        ${this.escapeHtml(currentContent.substring(0, 500))}${currentContent.length > 500 ? '...' : ''}
                    </div>
                </div>
            </div>
            ` : ''}
            
            ${complianceAnalysis ? `
            <div style="background: #f0f8ff; padding: 15px; border-left: 4px solid #4285f4; margin: 15px 0;">
                <h3>🔍 Crawl5 Compliance Analysis</h3>
                <p><strong>Impact Level:</strong> <span style="color: ${complianceAnalysis.impact_level === 'CRITICAL' ? '#dc2626' : complianceAnalysis.impact_level === 'HIGH' ? '#ea580c' : '#ca8a04'}">${complianceAnalysis.impact_level}</span></p>
                <p><strong>Summary:</strong> ${complianceAnalysis.change_summary}</p>
                ${crawl5UpdatesNeeded ? `<p><strong>Crawl5 Updates Needed:</strong> ${crawl5UpdatesNeeded}</p>` : ''}
            </div>
            ` : ''}
        </div>
        
        <div class="footer">
            <p><small>This alert was generated by your Google Ads Policy Monitor.<br>
            Review the changes and update your compliance scanning accordingly.</small></p>
        </div>
    </body>
    </html>
    `;
  }

  generateTextContent(changes) {
    const { url, title, description, changeType = 'POLICY_UPDATE', detectedAt, complianceAnalysis } = changes;
    
    return `
🔔 GOOGLE ADS POLICY CHANGE DETECTED

Policy: ${title}
Change Type: ${changeType.replace('_', ' ')}
Description: ${description}

URL: ${url}
Detected: ${new Date(detectedAt).toLocaleString()}

${complianceAnalysis ? `
Crawl5 Compliance Analysis:
Impact Level: ${complianceAnalysis.impact_level}
Summary: ${complianceAnalysis.summary}
Risk Level: ${complianceAnalysis.businessImpact?.risk_level}
${complianceAnalysis.recommendedActions?.immediate?.length > 0 ? `Immediate Actions: ${complianceAnalysis.recommendedActions.immediate.join(', ')}` : ''}` : ''}

Please review this change and update your compliance scanning accordingly.

---
Generated by Google Ads Policy Monitor
    `.trim();
  }

  getChangeClass(changeType) {
    const classMap = {
      'NEW_POLICY': 'new',
      'MAJOR_ADDITION': 'major',
      'MAJOR_REMOVAL': 'major',
      'MINOR_MODIFICATION': 'minor'
    };
    return classMap[changeType] || 'minor';
  }

  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async sendDailySummary(results) {
    // Check if email is configured and transporter is available
    if (!process.env.ALERT_EMAIL || !this.transporter) {
      console.log('📧 No changes detected, skipping daily summary');
      return;
    }
    
    console.log('📧 No changes detected, skipping daily summary');
  }

  generateSummaryContent(results) {
    const totalChecked = results.length;
    const changes = results.filter(r => r.hasChanges || r.isNew);
    
    let changesHtml = '';
    changes.forEach(change => {
      changesHtml += `
        <li>
          <strong>${change.changes.title}</strong><br>
          <em>${change.changes.changeType}: ${change.changes.description}</em><br>
          <a href="${change.changes.url}">View Policy</a>
        </li>
      `;
    });

    return `
    <h2>📊 Daily Policy Monitor Summary</h2>
    <p><strong>Policies Checked:</strong> ${totalChecked}</p>
    <p><strong>Changes Detected:</strong> ${changes.length}</p>
    
    ${changes.length > 0 ? `
    <h3>Changes Detected:</h3>
    <ul>${changesHtml}</ul>
    ` : '<p>✅ No changes detected today.</p>'}
    
    <p><small>Generated at: ${new Date().toLocaleString()}</small></p>
    `;
  }
}
