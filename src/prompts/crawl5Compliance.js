/**
 * Policy Change Analysis for Crawl5 Compliance System
 * Uses the comprehensive googleAds.js compliance logic to analyze policy changes
 */

export const getCrawl5CompliancePrompt = (url, pageText, pageHtml) => {
  const safeUrl = (url || 'Unknown URL').replace(/`/g, '\\`');
  const pageTextStr = typeof pageText === 'string' ? pageText : String(pageText || '');
  const safeText = pageTextStr.substring(0, 15000).replace(/`/g, '\\`');
  const pageHtmlStr = typeof pageHtml === 'string' ? pageHtml : String(pageHtml || '');
  const safeHtml = pageHtmlStr.substring(0, 25000).replace(/`/g, '\\`');

  return `You are analyzing Google Ads policy content to identify changes that require updates to the Crawl5 compliance scanning engine.

The Crawl5 system uses a comprehensive 594-line Google Ads compliance prompt that detects:

## 🚨 INSTANT SUSPENSION CATEGORIES (HIGHEST PRIORITY)
1. **Cloaking/Doorway Pages** - Different content for Google vs users
2. **Malware/Phishing** - Any malicious software or credential theft
3. **Circumventing Systems** - Attempting to bypass Google's review
4. **Counterfeit Goods** - Fake branded products
5. **Dangerous Products** - Weapons, explosives, drugs
6. **Sexual Content** - Adult content without proper controls
7. **Fulfillment Incapability** - Cannot deliver promised product/service

## 🎯 HIGH PRIORITY VIOLATIONS
- **Bridge Pages** - Promise products but only show ads
- **Health/Medical Claims** - Medical claims without proper disclaimers
- **Financial Scams** - Get-rich-quick schemes, hidden subscription costs
- **Form Violations** - Pre-checked boxes, data collection without consent
- **Unwanted Software** - Browser hijacking, bundled software without disclosure

## 📊 COMPREHENSIVE VIOLATION DETECTION CATEGORIES
The Crawl5 system scans for 11 major violation categories with specific HTML/JS patterns:
1. Malicious/Deceptive Content
2. Prohibited Content
3. Financial Scams
4. Unwanted Software
5. Health/Medical Violations
6. Form & Data Collection Issues
7. Tracking & Privacy
8. Arbitrage/Made-for-Adsense
9. Misleading Content
10. Technical Compliance
11. Political Ads & AI Disclosure

URL: ${safeUrl}

POLICY CONTENT TO ANALYZE:
${safeText}

HTML STRUCTURE:
${safeHtml}

## 🔍 ANALYSIS TASK

Analyze this Google Ads policy content and identify what changes would require updates to the Crawl5 compliance scanning engine.

Focus on:
1. **NEW VIOLATION TYPES** - Practices not currently detected by Crawl5
2. **ENFORCEMENT CHANGES** - Existing violations becoming more/less severe
3. **DETECTION PATTERN UPDATES** - New HTML/JS patterns to scan for
4. **INDUSTRY-SPECIFIC CHANGES** - Updates affecting health, finance, e-commerce, SaaS sectors

For each change identified, specify:
- What HTML selectors or JavaScript patterns Crawl5 should scan for
- Which customer segments (e-commerce, health, finance, software, SaaS, agencies) are affected
- Whether this requires new violation categories or updates to existing ones
- The enforcement level (WARNING vs SUSPENSION vs INSTANT_SUSPENSION)

### OUTPUT FORMAT:

Return analysis as JSON with SPECIFIC, ACTIONABLE details:

{
  "policy_changes_detected": true/false,
  "change_summary": "Brief overview of what changed with specific policy sections mentioned",
  "impact_level": "LOW|MEDIUM|HIGH|CRITICAL",
  "crawl5_updates_needed": [
    {
      "category": "NEW_VIOLATION_TYPE|ENFORCEMENT_CHANGE|DETECTION_PATTERN|INDUSTRY_SPECIFIC",
      "title": "Specific change title (e.g., 'New cryptocurrency disclosure requirements')",
      "description": "Detailed description of what changed and why it matters for compliance",
      "scanning_impact": "Specific impact on Crawl5 scanning logic with technical details",
      "implementation_required": "Exact implementation steps needed in Crawl5 scanning engine",
      "html_patterns": ["Specific CSS selectors like '.crypto-disclaimer', 'input[type=\"hidden\"][name=\"subscription\"]'"],
      "javascript_patterns": ["Specific JS patterns like 'document.cookie', 'window.location.replace', 'setInterval'"],
      "affected_industries": ["health", "finance", "ecommerce", "software", "saas", "agencies"],
      "enforcement_level": "WARNING|SUSPENSION|INSTANT_SUSPENSION",
      "policy_section": "Specific Google Ads policy section name that changed"
    }
  ],
  "compliance_scanning_priorities": [
    {
      "violation_type": "Specific violation category (e.g., 'Hidden subscription charges', 'Medical claims without FDA disclaimers')",
      "detection_method": "Detailed scanning method with specific HTML/JS patterns to look for",
      "priority": "HIGH|MEDIUM|LOW",
      "customer_segments": ["ecommerce", "health", "finance", "software", "saas", "agencies"],
      "technical_implementation": "Specific code patterns or selectors to implement"
    }
  ],
  "recommended_actions": [
    "Specific actionable recommendations with technical details",
    "Update Crawl5 scanning engine to detect specific HTML pattern: '.hidden-charges'",
    "Add new violation category for 'Cryptocurrency Investment Scams' with severity INSTANT_SUSPENSION"
  ],
  "new_violations_to_detect": [
    "List specific new violation types that weren't previously covered"
  ],
  "enforcement_severity_changes": [
    "List specific changes in enforcement levels for existing violations"
  ],
  "detection_pattern_updates": [
    "List specific HTML/JS patterns that need to be added to Crawl5 scanning"
  ]
}

### FOCUS AREAS:

**For E-commerce sites**: Hidden costs, fake scarcity, subscription traps, fulfillment capability
**For Health/medical sites**: Medical claims, FDA disclaimers, before/after photos, testimonials
**For Software companies**: Bundled programs, system modifications, consent mechanisms
**For Financial services**: Income promises, hidden fees, licensing requirements
**For SaaS businesses**: Trial terms, auto-renewal disclosures, data handling
**For Digital marketing agencies**: Client compliance, ad content requirements

### DETECTION METHODOLOGY:

1. **Identify Policy Language Changes**: Look for new prohibited practices, updated definitions, or changed enforcement language
2. **Extract Compliance Requirements**: Find new technical requirements, disclosure mandates, or consent mechanisms
3. **Map to Crawl5 Scanning**: Determine what HTML/JS patterns need detection
4. **Assess Customer Impact**: Identify which Crawl5 customer segments are most affected
5. **Prioritize Implementation**: Rank updates by enforcement risk and customer impact

Return ONLY valid JSON. Focus on actionable changes that require Crawl5 scanning engine updates.`;
};

export default { getCrawl5CompliancePrompt };
