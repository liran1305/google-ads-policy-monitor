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
                ${this.generateContentDiff(previousContent, currentContent, url)}
            </div>
            ` : ''}
            
            ${complianceAnalysis ? `
            <div style="background: #f0f8ff; padding: 15px; border-left: 4px solid #4285f4; margin: 15px 0;">
                <h3>🔍 Crawl5 Compliance Analysis</h3>
                <p><strong>Impact Level:</strong> <span style="color: ${complianceAnalysis.impact_level === 'CRITICAL' ? '#dc2626' : complianceAnalysis.impact_level === 'HIGH' ? '#ea580c' : complianceAnalysis.impact_level === 'MEDIUM' ? '#ca8a04' : '#16a34a'}">${complianceAnalysis.impact_level}</span></p>
                <p><strong>Summary:</strong> ${complianceAnalysis.summary || complianceAnalysis.change_summary}</p>
                
                ${complianceAnalysis.complianceImpact?.new_violations_to_detect?.length > 0 ? `
                <div style="background: #fef3c7; padding: 10px; border-radius: 5px; margin: 10px 0;">
                    <h4 style="margin: 0 0 5px 0; color: #92400e;">⚠️ New Violations to Detect:</h4>
                    <ul style="margin: 5px 0;">
                        ${complianceAnalysis.complianceImpact.new_violations_to_detect.map(v => `<li>${v}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${complianceAnalysis.recommendedActions?.immediate?.length > 0 ? `
                <div style="background: #fee2e2; padding: 10px; border-radius: 5px; margin: 10px 0;">
                    <h4 style="margin: 0 0 5px 0; color: #dc2626;">🚨 Immediate Actions Required:</h4>
                    <ul style="margin: 5px 0;">
                        ${complianceAnalysis.recommendedActions.immediate.map(a => `<li>${a}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${complianceAnalysis.businessImpact ? `
                <div style="background: #f3f4f6; padding: 10px; border-radius: 5px; margin: 10px 0;">
                    <h4 style="margin: 0 0 5px 0; color: #374151;">📊 Business Impact:</h4>
                    <p><strong>Risk Level:</strong> ${complianceAnalysis.businessImpact.risk_level}</p>
                    ${complianceAnalysis.businessImpact.affected_industries ? `<p><strong>Affected Industries:</strong> ${complianceAnalysis.businessImpact.affected_industries.join(', ')}</p>` : ''}
                    ${complianceAnalysis.businessImpact.customer_action_required ? `<p><strong>Customer Action Required:</strong> Yes</p>` : ''}
                </div>
                ` : ''}
                
                ${complianceAnalysis.contentAnalysis ? `
                <div style="background: #f0fdf4; padding: 10px; border-radius: 5px; margin: 10px 0;">
                    <h4 style="margin: 0 0 5px 0; color: #166534;">📈 Content Analysis:</h4>
                    ${complianceAnalysis.contentAnalysis.length_change ? `<p><strong>Content Length Change:</strong> ${complianceAnalysis.contentAnalysis.length_change > 0 ? '+' : ''}${complianceAnalysis.contentAnalysis.length_change} characters</p>` : ''}
                    ${complianceAnalysis.contentAnalysis.critical_keywords_found ? `<p><strong>Critical Keywords Found:</strong> Yes</p>` : ''}
                </div>
                ` : ''}
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

  normalizeContentForDisplay(content) {
    return content
      // Remove common dynamic elements that clutter the display
      .replace(/Skip to main content\s*/gi, '')
      .replace(/Give feedback about this article[\s\S]*?$/gi, '')
      .replace(/Choose a section to give fee[\s\S]*?$/gi, '')
      .replace(/For subtitles in your language[\s\S]*?choose your language\./gi, '')
      .replace(/Learn more about the commonly used policy terms[\s\S]*?glossary\./gi, '')
      .replace(/Select the settings icon[\s\S]*?choose your language\./gi, '')
      // Clean up excessive whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  generateContentDiff(previousContent, currentContent, url = '') {
    // Normalize both contents for comparison and remove navigation clutter
    const normalizePrevious = this.normalizeContentForDisplay(previousContent);
    const normalizeCurrent = this.normalizeContentForDisplay(currentContent);
    
    // Dynamic normalization to remove navigation and structural elements
    const deepNormalize = (content) => {
      return content
        // Remove any breadcrumb navigation patterns (words separated by >)
        .replace(/(?:^|\s)[^.!?]*?>\s*[^.!?]*?>\s*[^.!?]*?(?=\s|$)/g, '')
        .replace(/(?:^|\s)[^.!?]*?>\s*[^.!?]*?(?=\s|$)/g, '')
        // Remove common help page navigation elements dynamically
        .replace(/(?:Help|Get to know|Business settings|Upload)[\s\w]*?(?:Center|Next|products|integrations)/gi, '')
        // Remove footer and help elements
        .replace(/Skip to main content/gi, '')
        .replace(/Give feedback[\s\S]*?article/gi, '')
        .replace(/Was this helpful\?/gi, '')
        .replace(/Need more help\?/gi, '')
        .replace(/Post to the Help Community/gi, '')
        .replace(/Contact us/gi, '')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        .trim();
    };
    
    const deepNormPrevious = deepNormalize(normalizePrevious);
    const deepNormCurrent = deepNormalize(normalizeCurrent);
    
    // Split into sentences for better diff granularity
    const previousSentences = deepNormPrevious.split(/[.!?]+/).filter(s => s.trim().length > 15);
    const currentSentences = deepNormCurrent.split(/[.!?]+/).filter(s => s.trim().length > 15);
    
    // Find added and removed sentences with improved similarity matching
    const addedSentences = currentSentences.filter(sentence => 
      !previousSentences.some(prevSent => 
        this.improvedSentenceSimilarity(sentence.trim(), prevSent.trim()) > 0.7
      )
    );
    
    const removedSentences = previousSentences.filter(sentence => 
      !currentSentences.some(currSent => 
        this.improvedSentenceSimilarity(sentence.trim(), currSent.trim()) > 0.7
      )
    );
    
    let diffHtml = '';
    
    if (removedSentences.length > 0) {
      diffHtml += `
        <div style="margin-bottom: 15px;">
          <h4 style="color: #dc3545;">❌ Removed/Changed Content</h4>
          <div style="background: #f8d7da; padding: 10px; border-radius: 3px; font-size: 13px; max-height: 200px; overflow-y: auto;">
            ${removedSentences.slice(0, 5).map(sentence => 
              `<p style="margin: 5px 0; padding: 3px; border-left: 3px solid #dc3545;">- ${this.escapeHtml(sentence.trim())}.</p>`
            ).join('')}
            ${removedSentences.length > 5 ? `<p style="font-style: italic; color: #666;">... and ${removedSentences.length - 5} more removed sections</p>` : ''}
          </div>
        </div>
      `;
    }
    
    if (addedSentences.length > 0) {
      diffHtml += `
        <div>
          <h4 style="color: #28a745;">✅ Added/Updated Content</h4>
          <div style="background: #d4edda; padding: 10px; border-radius: 3px; font-size: 13px; max-height: 200px; overflow-y: auto;">
            ${addedSentences.slice(0, 5).map(sentence => 
              `<p style="margin: 5px 0; padding: 3px; border-left: 3px solid #28a745;">+ ${this.escapeHtml(sentence.trim())}.</p>`
            ).join('')}
            ${addedSentences.length > 5 ? `<p style="font-style: italic; color: #666;">... and ${addedSentences.length - 5} more added sections</p>` : ''}
          </div>
        </div>
      `;
    }
    
    if (diffHtml === '') {
      diffHtml = `
        <div style="background: #fff3cd; padding: 10px; border-radius: 3px; color: #856404;">
          <p><strong>⚠️ Changes detected but specific differences are subtle.</strong></p>
          <p>The policy content has been modified, but the changes may be:</p>
          <ul>
            <li>Minor wording adjustments</li>
            <li>Formatting or structure changes</li>
            <li>Updated dates or references</li>
            <li>Reordered content sections</li>
          </ul>
          <p><a href="${url}" target="_blank">View the full policy</a> to see all changes.</p>
        </div>
      `;
    }
    
    return diffHtml;
  }

  sentenceSimilarity(str1, str2) {
    // Simple similarity check based on common words
    const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  improvedSentenceSimilarity(str1, str2) {
    // Enhanced similarity check that handles content restructuring better
    const normalize = (str) => str.toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Remove punctuation
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();
    
    const norm1 = normalize(str1);
    const norm2 = normalize(str2);
    
    // Direct substring match for high confidence
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      return 0.95;
    }
    
    // Key phrase extraction for policy content
    const extractKeyPhrases = (text) => {
      const phrases = [];
      // Extract important multi-word phrases
      const words = text.split(/\s+/);
      for (let i = 0; i < words.length - 1; i++) {
        if (words[i].length > 3 && words[i + 1].length > 3) {
          phrases.push(`${words[i]} ${words[i + 1]}`);
        }
      }
      return new Set(phrases);
    };
    
    const phrases1 = extractKeyPhrases(norm1);
    const phrases2 = extractKeyPhrases(norm2);
    
    if (phrases1.size === 0 && phrases2.size === 0) {
      return this.sentenceSimilarity(str1, str2);
    }
    
    const phraseIntersection = new Set([...phrases1].filter(p => phrases2.has(p)));
    const phraseUnion = new Set([...phrases1, ...phrases2]);
    
    const phraseSimilarity = phraseUnion.size > 0 ? phraseIntersection.size / phraseUnion.size : 0;
    const wordSimilarity = this.sentenceSimilarity(str1, str2);
    
    // Weighted combination favoring phrase similarity for policy content
    return Math.max(phraseSimilarity * 0.7 + wordSimilarity * 0.3, wordSimilarity);
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
