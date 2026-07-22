/**
 * SECURITY-HARDENED logging utility that prevents sensitive data from being logged
 * and implements comprehensive data sanitization for production environments
 */

const isDevelopment = import.meta.env.DEV;
const ENABLE_DEBUG_LOGS = isDevelopment && import.meta.env.VITE_ENABLE_DEBUG_LOGS !== 'false';

// SECURITY: Comprehensive list of sensitive field patterns that should NEVER be logged
const SENSITIVE_PATTERNS = [
  // Authentication & Security
  /password/i, /pwd/i, /pass/i, /auth/i, /token/i, /jwt/i, /session/i,
  /key/i, /secret/i, /signature/i, /hash/i, /salt/i, /csrf/i,
  
  // Personal Identifiable Information (PII)
  /phone/i, /mobile/i, /tel/i, /email/i, /mail/i,
  /address/i, /postcode/i, /postal/i, /zip/i, /location/i,
  /contact/i, /personal/i, /private/i, /confidential/i,
  /dob/i, /birth/i, /age/i, /gender/i, /sex/i,
  /name/i, /surname/i, /firstname/i, /lastname/i,
  
  // Financial & Sensitive Business Data
  /bank/i, /account/i, /iban/i, /swift/i, /routing/i,
  /salary/i, /wage/i, /income/i, /payment/i, /card/i,
  /ni_number/i, /national_insurance/i, /ssn/i, /sin/i,
  /sort_code/i, /cvv/i, /cvc/i, /pin/i,
  
  // Healthcare & Sensitive Personal Data
  /medical/i, /health/i, /diagnosis/i, /prescription/i,
  /ooo/i, /absence/i, /sick/i, /emergency/i,
  
  // Internal System Data
  /internal/i, /admin/i, /config/i, /env/i, /debug/i,
  /api_key/i, /client_id/i, /client_secret/i
];

// Recursively sanitize object by removing sensitive fields
const sanitizeObject = (obj: any, depth = 0): any => {
  if (depth > 10) return '[Max Depth Exceeded]'; // Prevent infinite recursion
  
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    // Check if string contains sensitive patterns - more aggressive checking
    const lowerStr = obj.toLowerCase();
    if (SENSITIVE_PATTERNS.some(pattern => pattern.test(lowerStr))) {
      return '[REDACTED]';
    }
    // Also check for common sensitive string formats
    if (lowerStr.includes('@') && lowerStr.includes('.') && lowerStr.length > 5) {
      return '[EMAIL_REDACTED]';
    }
    if (/^\d{10,}$/.test(obj)) { // Long number sequences (phone, account numbers)
      return '[NUMBER_REDACTED]';
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if key matches sensitive patterns
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_PATTERNS.some(pattern => pattern.test(lowerKey))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeObject(value, depth + 1);
      }
    }
    return sanitized;
  }
  
  return obj;
};

export const secureLog = {
  info: (message: string, data?: any) => {
    if (ENABLE_DEBUG_LOGS) {
      const sanitizedData = data ? sanitizeObject(data) : undefined;
      console.log(`[INFO] ${message}`, sanitizedData);
    }
  },
  
  error: (message: string, error?: any) => {
    // Always log errors in production, but sanitize them
    const sanitizedError = error ? sanitizeObject(error) : undefined;
    console.error(`[ERROR] ${message}`, sanitizedError);
    
    // In production, also log to a more permanent store if needed
    if (!isDevelopment && typeof error === 'object' && error?.name) {
      console.error(`[PROD_ERROR] ${message} - Error Type: ${error.name}`);
    }
  },
  
  warn: (message: string, data?: any) => {
    if (ENABLE_DEBUG_LOGS) {
      const sanitizedData = data ? sanitizeObject(data) : undefined;
      console.warn(`[WARN] ${message}`, sanitizedData);
    }
  },
  
  debug: (message: string, data?: any) => {
    if (ENABLE_DEBUG_LOGS) {
      const sanitizedData = data ? sanitizeObject(data) : undefined;
      console.log(`[DEBUG] ${message}`, sanitizedData);
    }
  },
  
  // Special method for security-sensitive operations
  security: (message: string, data?: any) => {
    // Security logs always get logged but with maximum sanitization
    const sanitizedData = data ? sanitizeObject(data) : undefined;
    console.warn(`[SECURITY] ${message}`, sanitizedData);
  },
  
  // Method to log user actions without PII
  userAction: (action: string, userId?: string) => {
    if (ENABLE_DEBUG_LOGS) {
      const sanitizedUserId = userId ? `user_${userId.substring(0, 8)}...` : 'anonymous';
      console.log(`[USER_ACTION] ${action} by ${sanitizedUserId}`);
    }
  }
};