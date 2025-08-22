/**
 * Sitemap Parser Utility
 * Discovers and parses XML sitemaps to extract URLs for comprehensive crawling
 * 
 * Phase 2 Requirements:
 * - Check multiple sitemap locations
 * - Parse XML and extract <loc> elements
 * - Filter HTML pages only (skip PDFs, images)
 * - Respect priority ordering
 * - Same domain + subdomains only
 * - Return error if >1000 URLs found
 */


import axios from 'axios';
import { parseString } from 'xml2js';
import { URL } from 'url';
import { normalizeUrl } from './url.js';


/**
 * Extract URLs from sitemap XML with filtering and prioritization
 * @param {string} targetUrl - The original URL being scanned
 * @returns {Promise<{urls: Array, error: string|null, totalFound: number}>}
 */
async function extractSitemapUrls(targetUrl) {
  console.log(`[Sitemap Parser] Starting sitemap discovery for: ${targetUrl}`);
  
  try {
    const baseUrl = new URL(targetUrl);
    const baseDomain = baseUrl.hostname;
    
    // Try multiple sitemap locations in order of priority
    const sitemapLocations = [
      `${baseUrl.protocol}//${baseUrl.hostname}/sitemap.xml`,
      `${baseUrl.protocol}//${baseUrl.hostname}/sitemap_index.xml`,
      `${baseUrl.protocol}//${baseUrl.hostname}/sitemaps/sitemap.xml`,
      `${baseUrl.protocol}//${baseUrl.hostname}/robots.txt` // Check robots.txt for sitemap references
    ];
    
    let allUrls = [];
    let sitemapFound = false;
    
    for (const sitemapUrl of sitemapLocations) {
      console.log(`[Sitemap Parser] Checking: ${sitemapUrl}`);
      
      try {
        if (sitemapUrl.endsWith('robots.txt')) {
          // Parse robots.txt for sitemap references
          const robotsUrls = await parseRobotsTxt(sitemapUrl);
          if (robotsUrls.length > 0) {
            console.log(`[Sitemap Parser] Found ${robotsUrls.length} sitemap references in robots.txt`);
            for (const robotsSitemapUrl of robotsUrls) {
              const robotsResult = await parseSingleSitemap(robotsSitemapUrl, baseDomain);
              if (robotsResult.urls.length > 0) {
                allUrls = allUrls.concat(robotsResult.urls);
                sitemapFound = true;
              }
            }
          }
        } else {
          // Parse XML sitemap directly
          const result = await parseSingleSitemap(sitemapUrl, baseDomain);
          if (result.urls.length > 0) {
            allUrls = allUrls.concat(result.urls);
            sitemapFound = true;
            console.log(`[Sitemap Parser] ✅ Found ${result.urls.length} URLs in ${sitemapUrl}`);
          }
        }
      } catch (error) {
        console.log(`[Sitemap Parser] ❌ Failed to fetch ${sitemapUrl}: ${error.message}`);
        continue; // Try next location
      }
    }
    
    if (!sitemapFound) {
      console.log(`[Sitemap Parser] ❌ No sitemap found for ${baseDomain}`);
      return { urls: [], error: null, totalFound: 0 };
    }
    
    // Remove duplicates and filter
    const uniqueUrls = [...new Set(allUrls.map(item => item.url))];
    const filteredUrls = allUrls.filter((item, index, self) => 
      self.findIndex(u => u.url === item.url) === index
    );
    
    console.log(`[Sitemap Parser] 📊 Total URLs found: ${filteredUrls.length} (after deduplication)`);
    
    // Process all sitemap URLs (no artificial limit)
    console.log(`[Sitemap Parser] 📊 Processing all ${filteredUrls.length} URLs from sitemap`);
    
    // Sort by priority (higher priority first, then by URL)
    filteredUrls.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.url.localeCompare(b.url);
    });
    
    console.log(`[Sitemap Parser] ✅ Returning ${filteredUrls.length} prioritized URLs for crawling`);
    return { urls: filteredUrls.map(item => item.url), error: null, totalFound: filteredUrls.length };
    
  } catch (error) {
    console.error(`[Sitemap Parser] ❌ Error during sitemap extraction:`, error);
    return { urls: [], error: `Sitemap parsing failed: ${error.message}`, totalFound: 0 };
  }
}


/**
 * Parse a single XML sitemap
 * @param {string} sitemapUrl - URL of the sitemap to parse
 * @param {string} baseDomain - Base domain for filtering
 * @returns {Promise<{urls: Array}>}
 */
async function parseSingleSitemap(sitemapUrl, baseDomain) {
  const response = await axios.get(sitemapUrl, {
    timeout: 10000,
    headers: {
      'User-Agent': 'Crawl5-SitemapParser/1.0'
    }
  });
  
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const xmlData = response.data;
  
  return new Promise((resolve, reject) => {
    parseString(xmlData, (err, result) => {
      if (err) {
        reject(new Error(`XML parsing failed: ${err.message}`));
        return;
      }
      
      const urls = [];
      
      try {
        // Handle sitemap index (contains references to other sitemaps)
        if (result.sitemapindex && result.sitemapindex.sitemap) {
          console.log(`[Sitemap Parser] 📋 Found sitemap index with ${result.sitemapindex.sitemap.length} sitemaps`);
          // For now, we're staying with one level as requested
          // Could be extended later to recursively parse nested sitemaps
          resolve({ urls: [] });
          return;
        }
        
        // Handle regular sitemap (contains actual URLs)
        if (result.urlset && result.urlset.url) {
          const sitemapUrls = result.urlset.url;
          
          for (const urlEntry of sitemapUrls) {
            if (urlEntry.loc && urlEntry.loc[0]) {
              const rawUrl = urlEntry.loc[0];
              // Normalize URL to remove trailing colons and other issues
              const url = normalizeUrl(rawUrl);
              
              // Skip if URL normalization failed (malformed URL)
              if (!url) {
                console.log(`[Sitemap Parser] Skipping malformed URL from sitemap: ${rawUrl}`);
                continue;
              }
              
              const priority = urlEntry.priority ? parseFloat(urlEntry.priority[0]) : 0.5;
              
              // Filter: same domain + subdomains only
              if (isValidDomain(url, baseDomain) && isHtmlPage(url)) {
                urls.push({
                  url: url,
                  priority: priority
                });
              }
            }
          }
        }
        
        resolve({ urls });
        
      } catch (parseError) {
        reject(new Error(`Sitemap structure parsing failed: ${parseError.message}`));
      }
    });
  });
}


/**
 * Parse robots.txt for sitemap references
 * @param {string} robotsUrl - URL of robots.txt
 * @returns {Promise<Array<string>>} Array of sitemap URLs found
 */
async function parseRobotsTxt(robotsUrl) {
  try {
    const response = await axios.get(robotsUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Crawl5-SitemapParser/1.0'
      }
    });
    
    if (response.status !== 200) {
      return [];
    }
    
    const robotsContent = response.data;
    const sitemapUrls = [];
    
    // Extract sitemap URLs from robots.txt
    const lines = robotsContent.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.toLowerCase().startsWith('sitemap:')) {
        const sitemapUrl = trimmedLine.substring(8).trim();
        if (sitemapUrl) {
          sitemapUrls.push(sitemapUrl);
        }
      }
    }
    
    console.log(`[Sitemap Parser] Found ${sitemapUrls.length} sitemap references in robots.txt`);
    return sitemapUrls;
    
  } catch (error) {
    console.log(`[Sitemap Parser] Could not parse robots.txt: ${error.message}`);
    return [];
  }
}


/**
 * Check if URL belongs to same domain or subdomain
 * @param {string} url - URL to check
 * @param {string} baseDomain - Base domain to compare against
 * @returns {boolean}
 */
function isValidDomain(url, baseDomain) {
  try {
    const urlObj = new URL(url);
    const urlDomain = urlObj.hostname;
    
    // Same domain or subdomain
    return urlDomain === baseDomain || urlDomain.endsWith(`.${baseDomain}`);
  } catch (error) {
    return false;
  }
}


/**
 * Check if URL points to an HTML page (skip PDFs, images, etc.)
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isHtmlPage(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    
    // Skip common non-HTML file extensions
    const skipExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.css', '.js', '.xml', '.txt', '.zip', '.doc', '.docx', '.xls', '.xlsx'];
    
    for (const ext of skipExtensions) {
      if (pathname.endsWith(ext)) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    return false;
  }
}


export {
  extractSitemapUrls
};
