import dotenv from 'dotenv';
import { getCrawl5CompliancePrompt } from '../prompts/crawl5Compliance.js';

dotenv.config();

export class AIAnalyzer {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
    this.crawl5ApiUrl = process.env.CRAWL5_API_URL || 'http://localhost:3001';
    this.crawl5ApiUrl2 = process.env.CRAWL5_API_URL || 'http://localhost:4000';
  }

  async analyzePolicyContent(policyContent, compliancePrompt = null) {
    if (!this.apiKey) {
      console.warn('⚠️ GEMINI_API_KEY not found, skipping AI analysis');
      return null;
    }

    try {
      const prompt = this.buildAnalysisPrompt(policyContent, compliancePrompt);
      
      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (analysis) {
        console.log('🤖 AI analysis completed successfully');
        return analysis.trim();
      } else {
        console.warn('⚠️ No analysis content returned from Gemini');
        return null;
      }

    } catch (error) {
      console.error('❌ AI analysis failed:', error);
      return null;
    }
  }

  async analyzePolicyForCrawl5(policyContent, url = '') {
    // Try Crawl5 backend first (uses your actual googleAds.js prompt)
    const crawl5Result = await this.callCrawl5Backend({
      url,
      pageText: policyContent,
      pageHtml: '',
      analysisType: 'policy_change_analysis'
    });
    
    if (crawl5Result) {
      return crawl5Result;
    }

    // Fallback to local analysis if Crawl5 backend unavailable
    console.log('🤖 Crawl5 backend unavailable, using local analysis...');
    
    if (!this.apiKey) {
      console.warn('⚠️ GEMINI_API_KEY not found, skipping local analysis');
      return null;
    }

    try {
      const prompt = getCrawl5CompliancePrompt(url, policyContent, '');
      
      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 4096,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (analysis) {
        console.log('🔍 Local compliance analysis completed');
        try {
          const jsonMatch = analysis.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
          return { raw_analysis: analysis.trim() };
        } catch (parseError) {
          console.warn('⚠️ Could not parse JSON response, returning raw text');
          return { raw_analysis: analysis.trim() };
        }
      } else {
        console.warn('⚠️ No analysis content returned from Gemini');
        return null;
      }

    } catch (error) {
      console.error('❌ Local analysis failed:', error);
      return null;
    }
  }

  async callCrawl5Backend(policyData) {
    // Skip Crawl5 backend if URL is not configured
    if (!this.crawl5ApiUrl2) {
      console.log('⚠️ Crawl5 backend not configured, skipping...');
      return null;
    }

    try {
      // Health check first
      console.log('🔍 Checking Crawl5 health at:', `${this.crawl5ApiUrl2}/api/policy-analysis/health`);
      console.log('🔍 Using CRAWL5_API_URL from env:', this.crawl5ApiUrl2);
      console.log('🔍 CRAWL5_API_KEY value:', process.env.CRAWL5_API_KEY ? `${process.env.CRAWL5_API_KEY.substring(0, 10)}...` : 'NOT FOUND');
      
      // Prepare headers with authentication if available
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (process.env.CRAWL5_API_KEY) {
        headers['api-key'] = process.env.CRAWL5_API_KEY;
        console.log('🔑 Using API key for authentication');
      } else if (process.env.CRAWL5_AUTH_TOKEN) {
        headers['Authorization'] = `Token ${process.env.CRAWL5_AUTH_TOKEN}`;
        console.log('🔑 Using auth token for authentication');
      } else {
        console.log('⚠️ No authentication credentials found');
      }
      
      const healthResponse = await fetch(`${this.crawl5ApiUrl2}/api/policy-analysis/health`, {
        headers,
        timeout: 5000 // 5 second timeout
      });
      
      console.log('🔍 Health response status:', healthResponse.status);
      console.log('🔍 Health response ok:', healthResponse.ok);
      
      if (!healthResponse.ok) {
        const errorText = await healthResponse.text();
        console.warn('⚠️ Crawl5 backend not available - health check failed:', healthResponse.status, errorText);
        return null;
      }
      console.log('✅ Crawl5 health check passed');

      // Generate the detailed compliance prompt
      const compliancePrompt = getCrawl5CompliancePrompt(policyData.url, policyData.pageText, policyData.pageHtml || '');
      console.log('📋 Generated detailed compliance prompt for Crawl5 analysis');

      // Call Crawl5's policy analysis endpoint with the detailed prompt
      const analysisResponse = await fetch(`${this.crawl5ApiUrl2}/api/policy-analysis/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          previousContent: '', // No previous content for new policy analysis
          currentContent: policyData.pageText,
          policyUrl: policyData.url,
          analysisPrompt: compliancePrompt, // Include the detailed compliance prompt
          analysisType: 'policy_change_analysis',
          requireDetailedOutput: true // Flag to request detailed JSON response
        }),
        timeout: 30000 // 30 second timeout
      });

      if (analysisResponse.ok) {
        const result = await analysisResponse.json();
        console.log('🔗 Crawl5 backend analysis completed');
        console.log('📊 Response data:', JSON.stringify(result, null, 2));
        
        // Transform the result for policy monitoring context
        return this.transformCrawl5Result(result);
      } else {
        const errorText = await analysisResponse.text();
        console.warn('⚠️ Crawl5 backend analysis failed:', analysisResponse.status, errorText);
        return null;
      }
    } catch (error) {
      console.warn('⚠️ Could not connect to Crawl5 backend:', error.message);
      console.warn('🔍 Full error details:', error);
      return null;
    }
  }

  transformCrawl5Result(crawl5Result) {
    // Transform Crawl5 compliance result into policy change analysis format
    const hasViolations = crawl5Result.has_violation || (crawl5Result.violations && crawl5Result.violations.length > 0);
    
    return {
      policy_changes_detected: hasViolations,
      change_summary: hasViolations ? 
        `Detected ${crawl5Result.violations?.length || 0} compliance issues that may indicate policy changes` :
        'No significant compliance issues detected in policy content',
      impact_level: this.mapSeverityToImpact(crawl5Result.violations),
      crawl5_updates_needed: this.extractCrawl5Updates(crawl5Result.violations || []),
      compliance_score: crawl5Result.compliance_score || 100,
      raw_crawl5_result: crawl5Result
    };
  }

  mapSeverityToImpact(violations) {
    if (!violations || violations.length === 0) return 'LOW';
    
    const hasCritical = violations.some(v => v.severity === 'critical');
    const hasHigh = violations.some(v => v.severity === 'high');
    
    if (hasCritical) return 'CRITICAL';
    if (hasHigh) return 'HIGH';
    return 'MEDIUM';
  }

  extractCrawl5Updates(violations) {
    return violations.map(violation => ({
      category: 'DETECTION_PATTERN',
      title: violation.title,
      description: violation.description,
      scanning_impact: `Update Crawl5 to detect: ${violation.title}`,
      implementation_required: violation.complete_solution,
      html_patterns: violation.evidence?.code_snippet ? [violation.evidence.code_snippet] : [],
      javascript_patterns: [],
      affected_industries: this.mapViolationToIndustries(violation.category),
      enforcement_level: violation.severity === 'critical' ? 'INSTANT_SUSPENSION' : 
                        violation.severity === 'high' ? 'SUSPENSION' : 'WARNING'
    }));
  }

  mapViolationToIndustries(category) {
    const industryMap = {
      'Health/Medical': ['health'],
      'Financial': ['finance'],
      'E-commerce': ['ecommerce'],
      'Software': ['software'],
      'Form Violations': ['ecommerce', 'software', 'health'],
      'Deceptive Practices': ['ecommerce', 'finance']
    };
    
    return industryMap[category] || ['ecommerce', 'health', 'finance', 'software'];
  }


  buildAnalysisPrompt(policyContent, compliancePrompt) {
    const basePrompt = `
You are an expert Google Ads policy compliance analyst. Analyze the following policy content and provide insights.

POLICY CONTENT TO ANALYZE:
${policyContent.substring(0, 50000)} ${policyContent.length > 50000 ? '...[truncated]' : ''}

ANALYSIS REQUIREMENTS:
1. Identify key policy changes or updates
2. Highlight compliance requirements that businesses should be aware of
3. Flag any new restrictions or prohibited content
4. Provide actionable recommendations for advertisers
5. Rate the severity of changes (LOW/MEDIUM/HIGH impact)

${compliancePrompt ? `
SPECIFIC COMPLIANCE CONTEXT:
${compliancePrompt}

Please also analyze this policy content specifically against the above compliance requirements.
` : ''}

Provide a structured analysis with:
- Summary of key changes
- Impact level (LOW/MEDIUM/HIGH)
- Specific compliance actions needed
- Risk areas to monitor

Keep the analysis concise but comprehensive.`;

    return basePrompt;
  }

  async compareWithPrevious(currentContent, previousContent, compliancePrompt = null) {
    if (!this.apiKey) {
      console.warn('⚠️ GEMINI_API_KEY not found, skipping change analysis');
      return null;
    }

    try {
      const prompt = `
You are analyzing changes between two versions of Google Ads policy content.

PREVIOUS VERSION:
${previousContent.substring(0, 25000)} ${previousContent.length > 25000 ? '...[truncated]' : ''}

CURRENT VERSION:
${currentContent.substring(0, 25000)} ${currentContent.length > 25000 ? '...[truncated]' : ''}

${compliancePrompt ? `
COMPLIANCE CONTEXT:
${compliancePrompt}
` : ''}

Analyze the differences and provide:
1. What changed (additions, removals, modifications)
2. Impact level (LOW/MEDIUM/HIGH)
3. Compliance implications
4. Recommended actions for advertisers
5. Timeline for compliance (if specified)

Focus on meaningful changes that affect advertiser compliance, not minor formatting or navigation updates.`;

      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (analysis) {
        console.log('🔄 Change analysis completed successfully');
        return analysis.trim();
      } else {
        console.warn('⚠️ No change analysis returned from Gemini');
        return null;
      }

    } catch (error) {
      console.error('❌ Change analysis failed:', error);
      return null;
    }
  }
}
