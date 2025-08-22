import { chromium } from 'playwright';
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
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    };

    // For Docker environments, set explicit executable path
    if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
      const fs = await import('fs');
      const possiblePaths = [
        '/home/pwuser/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell',
        '/home/pwuser/.cache/ms-playwright/chromium-1187/chrome-linux/chrome',
        '/root/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell',
        '/root/.cache/ms-playwright/chromium-1187/chrome-linux/chrome'
      ];
      
      for (const path of possiblePaths) {
        if (fs.existsSync && fs.existsSync(path)) {
          launchOptions.executablePath = path;
          console.log(`🎯 Using Chromium executable: ${path}`);
          break;
        }
      }
    }

    this.browser = await chromium.launch(launchOptions);
    
    // Create new page with US locale and geolocation
    this.page = await this.browser.newPage({
      locale: 'en-US',
      geolocation: { latitude: 37.7749, longitude: -122.4194 }, // San Francisco, CA
      permissions: ['geolocation']
    });
    
    // Set user agent and headers to force US content
    await this.page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });
  }

  async discoverPolicyUrls(hubUrl) {
    console.log(`🔍 Discovering policy URLs from: ${hubUrl}`);
    
    try {
      await this.page.goto(hubUrl, { waitUntil: 'networkidle' });
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
      // Force US locale by adding URL parameters
      const usUrl = this.forceUSLocale(url);
      console.log(`🇺🇸 Using US-localized URL: ${usUrl}`);
      
      await this.page.goto(usUrl, { waitUntil: 'networkidle' });
      
      // Wait for dynamic content to load - Google support pages often load content via JS
      try {
        await this.page.waitForSelector('[data-content-root], [role="main"], .article-content', { timeout: 5000 });
        // Additional wait for any lazy-loaded content
        await this.page.waitForTimeout(3000);
        
        // Scroll to load any lazy content
        await this.page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await this.page.waitForTimeout(1000);
        
        // Expand any collapsed sections (Google uses "zippy" components)
        await this.page.evaluate(() => {
          // Click all expandable sections
          const expandButtons = document.querySelectorAll('[role="button"][aria-expanded="false"], .zippy-header, [data-expandable]');
          expandButtons.forEach(button => {
            try {
              button.click();
            } catch (e) {}
          });
        });
        await this.page.waitForTimeout(1000);
        
      } catch (error) {
        console.log('⚠️ Content loading timeout, proceeding with available content');
      }
      
      // Get content using Playwright's text extraction for better results
      let playwrightContent = '';
      try {
        playwrightContent = await this.page.evaluate(() => {
          // Remove navigation and non-content elements
          const elementsToRemove = document.querySelectorAll('nav, header, footer, .navigation, .breadcrumb, .sidebar, .related-links, .feedback, .help-footer, script, style');
          elementsToRemove.forEach(el => el.remove());
          
          // Get main content area
          const mainContent = document.querySelector('[data-content-root], [role="main"], .article-content, main') || document.body;
          return mainContent.innerText || mainContent.textContent || '';
        });
      } catch (error) {
        console.log('⚠️ Playwright content extraction failed, using Cheerio fallback');
      }
      
      const content = await this.page.content();
      const $ = cheerio.load(content);
      
      // Extract main content - improved selectors for Google support pages
      const title = $('h1').first().text().trim();
      
      // Use Playwright-extracted content if it's substantial, otherwise fallback to Cheerio
      let mainContent = '';
      
      if (playwrightContent && playwrightContent.length > 2000) {
        mainContent = playwrightContent;
        console.log(`✅ Using Playwright-extracted content (${playwrightContent.length} chars)`);
      } else {
        console.log(`⚠️ Playwright content too short (${playwrightContent.length} chars), using Cheerio fallback`);
        
        // Enhanced selectors for Google support pages - target actual policy content
        const contentSelectors = [
          // Primary content areas for Google support
          '[data-content-root] [jsname]',
          '[role="main"] [data-content-root]',
          '.article-wrapper .article-content',
          '.support-content .content-body',
          '[data-content-root] .content',
          '.zippy-content', // Google's expandable content sections
          '.article-content .content',
          // Fallback selectors
          '[role="main"]',
          'main',
          '.main-content'
        ];
        
        // Try each selector and get the longest content
        for (const selector of contentSelectors) {
          const elements = $(selector);
          if (elements.length > 0) {
            let selectorContent = '';
            elements.each((i, el) => {
              const elementText = $(el).text();
              if (elementText.length > 100) { // Only include substantial content
                selectorContent += elementText + '\n\n';
              }
            });
            
            if (selectorContent.length > mainContent.length) {
              mainContent = selectorContent;
            }
          }
        }
        
        // Enhanced fallback - remove navigation and get body content
        if (!mainContent || mainContent.length < 2000) {
          // Remove all non-content elements more aggressively
          $('script, style, nav, header, footer, .navigation, .breadcrumb, .sidebar, .related-links, .feedback, .help-footer').remove();
          
          // Try to get content from specific Google support page structures
          const bodySelectors = [
            '[data-content-root]',
            '[role="main"]',
            '.content-wrapper',
            'body'
          ];
          
          for (const selector of bodySelectors) {
            const content = $(selector).text();
            if (content && content.length > mainContent.length) {
              mainContent = content;
              break;
            }
          }
        }
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

  forceUSLocale(url) {
    try {
      const urlObj = new URL(url);
      
      // Add US locale parameters for Google support pages
      urlObj.searchParams.set('hl', 'en-US');  // Language
      urlObj.searchParams.set('gl', 'US');     // Country/Region
      
      // For Google Ads policy pages, ensure we're getting US-specific content
      if (url.includes('support.google.com')) {
        urlObj.searchParams.set('visit_id', Date.now().toString()); // Cache busting
      }
      
      return urlObj.toString();
    } catch (error) {
      console.warn('⚠️ Could not parse URL for localization:', url);
      return url;
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
