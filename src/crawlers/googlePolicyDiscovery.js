import puppeteer from 'puppeteer';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

export class GooglePolicyDiscovery {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    
    // Set user agent to avoid blocking
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
  }

  async discoverPolicyUrls(hubUrl) {
    console.log(`🔍 Discovering policy URLs from: ${hubUrl}`);
    
    try {
      await this.page.goto(hubUrl, { waitUntil: 'networkidle2' });
      const content = await this.page.content();
      const $ = cheerio.load(content);
      
      const policyUrls = new Set();
      
      // Find all links that contain policy-related keywords - expanded selectors
      const selectors = [
        'a[href*="support.google.com/publisherpolicies"]',
        'a[href*="support.google.com/adspolicy"]',
        'a[href*="support.google.com/adsense"]',
        'a[href*="/answer/"]',
        'a[href*="/topic/"]'
      ];
      
      selectors.forEach(selector => {
        $(selector).each((i, element) => {
          const href = $(element).attr('href');
          if (href && this.isPolicyUrl(href)) {
            // Normalize URL
            const fullUrl = href.startsWith('http') ? href : `https://support.google.com${href}`;
            policyUrls.add(fullUrl);
          }
        });
      });

      console.log(`📋 Found ${policyUrls.size} policy URLs`);
      return Array.from(policyUrls);
    } catch (error) {
      console.error('❌ Error discovering policy URLs:', error);
      return [];
    }
  }

  isPolicyUrl(url) {
    const policyKeywords = [
      '/answer/',
      '/topic/',
      'policies',
      'restrictions',
      'standards'
    ];
    
    return policyKeywords.some(keyword => url.includes(keyword));
  }

  async extractPolicyContent(url) {
    console.log(`📄 Extracting content from: ${url}`);
    
    try {
      await this.page.goto(url, { waitUntil: 'networkidle2' });
      const content = await this.page.content();
      const $ = cheerio.load(content);
      
      // Extract main content - improved selectors for Google support pages
      const title = $('h1').first().text().trim();
      
      // Try multiple content selectors for Google support pages
      let mainContent = '';
      
      // Google support pages often use these selectors
      const contentSelectors = [
        '[role="main"] .content',
        '[data-content-root]',
        '.article-content',
        '.support-content',
        'main .content',
        '[role="main"]',
        'main',
        '.main-content'
      ];
      
      for (const selector of contentSelectors) {
        const content = $(selector).text();
        if (content && content.length > mainContent.length) {
          mainContent = content;
        }
      }
      
      // Fallback to body but remove script/style content
      if (!mainContent || mainContent.length < 1000) {
        $('script, style, nav, header, footer').remove();
        mainContent = $('body').text();
      }
      
      // Clean up the content
      mainContent = mainContent
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
      
      // Extract last modified date if available
      const lastModified = $('[data-last-modified]').text() || 
                          $('time').attr('datetime') || 
                          new Date().toISOString();

      return {
        url,
        title,
        content: mainContent.trim(),
        lastModified,
        extractedAt: new Date().toISOString(),
        contentHash: this.generateContentHash(mainContent)
      };
    } catch (error) {
      console.error(`❌ Error extracting content from ${url}:`, error);
      return null;
    }
  }

  generateContentHash(content) {
    // Simple hash function for content comparison
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
