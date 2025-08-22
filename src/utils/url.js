/**
 * URL normalization utility
 * Cleans and standardizes URLs for consistent processing
 */

/**
 * Normalize URL by removing trailing colons and other issues
 * @param {string} rawUrl - Raw URL to normalize
 * @returns {string|null} Normalized URL or null if invalid
 */
export function normalizeUrl(rawUrl) {
  try {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return null;
    }
    
    // Remove trailing colons and whitespace
    let cleanUrl = rawUrl.trim().replace(/:+$/, '');
    
    // Ensure URL has protocol
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    
    // Validate URL
    const urlObj = new URL(cleanUrl);
    return urlObj.href;
    
  } catch (error) {
    return null;
  }
}
