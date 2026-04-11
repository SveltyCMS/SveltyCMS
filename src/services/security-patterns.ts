/**
 * @file src/services/security-patterns.ts
 * @description Hardened, ReDoS-safe security patterns for threat detection.
 * Aligned with OWASP Core Rule Set (CRS) logic where appropriate.
 */

export const SECURITY_PATTERNS = {
  // SQL Injection patterns (UNION, boolean, time-based, stacked, comment)
  sqli: [
    /(%27)|(')|(--\s+)|(%23\s+)/i,
    /((%3D)|(=))[^<>\n]{0,500}((%27)|(')|(--\s+)|(%3B)|(;))/i,
    /\w*((%27)|('))((%6F)|o|(%4F))((%72)|r|(%52))/i,
    /((%27)|('))union/i,
    /exec(\s|\+)+(s|x)p\w+/i,
    /\b(union\s+(all\s+)?select|select\s+.*from|insert\s+into|update\s+.*set|delete\s+from|drop\s+(table|database))\b/i,
    /\b(or|and)\s+\d+=\d+/i,
    /\b(waitfor|benchmark|sleep|pg_sleep)\s*\(/i,
    /;\s*(drop|alter|create|truncate|exec)\b/i,
    /\/\*[^*/]{0,5000}\*\//i,
  ],

  // XSS patterns (tags, event handlers, javascript: URIs, encoded)
  xss: [
    /((%3C)|<)((%2F)|\/)*[a-z0-9%]+[^<>\n]{0,1000}?(?:(%3E)|>)/i,
    /((%3C)|<)((%69)|i|(%49))((%6D)|m|(%4D))((%67)|g|(%47))[^<>\n]{1,500}?(?:(%3E)|>)/i,
    /((%3C)|<)[^<>\n]{1,1000}?(?:(%3E)|>)/i,
    /(?:on(?:load|error|click|mouseover|focus|blur|submit|change|input|keyup|keydown))\s*=/i,
    /javascript\s*:/i,
    /\beval\s*\(/i,
    /\bdocument\.(cookie|domain|write|location)/i,
    /\bwindow\.(location|open|eval)/i,
    /<script[^>]{0,500}?>/i,
    /<iframe[^>]{0,500}?>/i,
    /<object[^>]{0,500}?>/i,
    /<embed[^>]{0,500}?>/i,
  ],

  // Path traversal
  pathTraversal: [/(\.\.(\/|\\))/i, /(%2e%2e(%2f|%5c))/i, /\.\.(\/|\\){2,}/i],

  // Command injection (pipe, backtick, $(), &&, ||)
  commandInjection: [
    /[;|`&|]\s*(cat|ls|dir|whoami|id|uname|passwd|shadow|wget|curl|nc|ncat|bash|sh|cmd|powershell)\b/i,
    /\$\([^\n)]{1,500}\)/i,
    /\b(&&|\|\|)\s*(cat|ls|rm|mv|cp|wget|curl|bash|sh)\b/i,
    /`[^`]{1,500}`/i,
  ],

  // LDAP injection
  ldapInjection: [/[()\\*|&]/, /\\x00/, /\b(objectClass|cn|uid|sn|givenName|mail)\s*[=~><]/i],

  // Suspicious user agents (scanners, attack tools, advanced bots)
  suspicious_ua: [
    /sqlmap/i,
    /nikto/i,
    /burpsuite/i,
    /nmap/i,
    /masscan/i,
    /dirbuster/i,
    /gobuster/i,
    /wfuzz/i,
    /hydra/i,
    /metasploit/i,
    /acunetix/i,
    /nessus/i,
    /openvas/i,
    /w3af/i,
    /skipfish/i,
    /HeadlessChrome/i,
    /PhantomJS/i,
    /Selenium/i,
    /Puppeteer/i,
    /WebDriver/i,
    /Playwright/i,
    /Nightmare/i,
    /ZombieJS/i,
  ],

  /**
   * Application-specific threats consolidated from middleware.
   */
  app_threats: [
    // Suspicious parameter patterns (credentials in URL query params)
    /[?&](password|token|secret|api_key|auth)=[^&]{1,500}/i,

    // Bulk operations abuse
    /\/api\/(users|content|collections)\/bulk-(delete|update|create)/i,

    // Administrative endpoint enumeration
    /\/(admin|manage|control-panel|dashboard)\/[^/]*\/(delete|remove|destroy)/i,

    // Known malicious payloads in paths
    /<script[^>]{0,200}>|javascript:\s*|data:text\/html|vbscript:/i,

    // Template injection attempts
    /(?<!\{\{)\$\{.*\}|(?<!\{\{)<%.*%>|(?<!\{\{)\{\{.*[;<>].*\}\}/i,
  ],
};
