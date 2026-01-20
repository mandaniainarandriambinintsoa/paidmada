/**
 * Tests pour les utilitaires cryptographiques
 */

import {
  generateCorrelationId,
  generateTransactionReference,
  toBase64,
  fromBase64,
  createHmacSignature,
  verifyHmacSignature,
  timingSafeCompare,
  sanitizeForHtml,
  sanitizeCallbackData,
  maskSensitiveData
} from '../src/utils/crypto';

describe('Crypto Utils', () => {
  describe('generateCorrelationId', () => {
    it('should generate a valid UUID', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateCorrelationId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('generateTransactionReference', () => {
    it('should generate a reference with default prefix', () => {
      const ref = generateTransactionReference();
      expect(ref).toMatch(/^TXN-[A-Z0-9]+-[A-F0-9]+$/);
    });

    it('should generate a reference with custom prefix', () => {
      const ref = generateTransactionReference('PAY');
      expect(ref.startsWith('PAY-')).toBe(true);
    });

    it('should generate unique references', () => {
      const refs = new Set(Array.from({ length: 100 }, () => generateTransactionReference()));
      expect(refs.size).toBe(100);
    });
  });

  describe('Base64 encoding/decoding', () => {
    it('should encode to base64', () => {
      expect(toBase64('hello')).toBe('aGVsbG8=');
      expect(toBase64('user:password')).toBe('dXNlcjpwYXNzd29yZA==');
    });

    it('should decode from base64', () => {
      expect(fromBase64('aGVsbG8=')).toBe('hello');
      expect(fromBase64('dXNlcjpwYXNzd29yZA==')).toBe('user:password');
    });

    it('should be reversible', () => {
      const original = 'test data with special chars: éàü';
      expect(fromBase64(toBase64(original))).toBe(original);
    });
  });

  describe('HMAC Signature', () => {
    const secret = 'my-secret-key';
    const data = '{"amount":10000,"phone":"0341234567"}';

    it('should create consistent signatures', () => {
      const sig1 = createHmacSignature(data, secret);
      const sig2 = createHmacSignature(data, secret);
      expect(sig1).toBe(sig2);
    });

    it('should create different signatures for different data', () => {
      const sig1 = createHmacSignature(data, secret);
      const sig2 = createHmacSignature(data + '1', secret);
      expect(sig1).not.toBe(sig2);
    });

    it('should verify valid signatures', () => {
      const signature = createHmacSignature(data, secret);
      expect(verifyHmacSignature(data, signature, secret)).toBe(true);
    });

    it('should reject invalid signatures', () => {
      const signature = createHmacSignature(data, secret);
      expect(verifyHmacSignature(data, signature + 'x', secret)).toBe(false);
      expect(verifyHmacSignature(data, signature, 'wrong-secret')).toBe(false);
    });
  });

  describe('timingSafeCompare', () => {
    it('should return true for equal strings', () => {
      expect(timingSafeCompare('password123', 'password123')).toBe(true);
      expect(timingSafeCompare('', '')).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(timingSafeCompare('password123', 'password124')).toBe(false);
      expect(timingSafeCompare('short', 'longer-string')).toBe(false);
    });

    it('should return false for non-string inputs', () => {
      expect(timingSafeCompare(null as any, 'test')).toBe(false);
      expect(timingSafeCompare('test', undefined as any)).toBe(false);
      expect(timingSafeCompare(123 as any, 123 as any)).toBe(false);
    });
  });

  describe('sanitizeForHtml', () => {
    it('should escape HTML special characters', () => {
      expect(sanitizeForHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(sanitizeForHtml('"quotes" & \'apostrophes\'')).toBe('&quot;quotes&quot; &amp; &#x27;apostrophes&#x27;');
    });

    it('should limit string length', () => {
      const longString = 'a'.repeat(300);
      expect(sanitizeForHtml(longString).length).toBe(200);
    });

    it('should handle non-string inputs', () => {
      expect(sanitizeForHtml(null)).toBe('');
      expect(sanitizeForHtml(undefined)).toBe('');
      expect(sanitizeForHtml(123)).toBe('');
    });
  });

  describe('sanitizeCallbackData', () => {
    it('should only keep whitelisted fields', () => {
      const query = {
        order_id: 'ORD123',
        status: 'SUCCESS',
        malicious: '<script>alert(1)</script>',
        extra: 'data'
      };
      const result = sanitizeCallbackData(query, ['order_id', 'status']);

      expect(result).toEqual({
        order_id: 'ORD123',
        status: 'SUCCESS'
      });
      expect(result).not.toHaveProperty('malicious');
      expect(result).not.toHaveProperty('extra');
    });

    it('should sanitize field values', () => {
      const query = {
        order_id: 'ORD-123_test',
        status: 'SUCCESS<script>'
      };
      const result = sanitizeCallbackData(query, ['order_id', 'status']);

      expect(result.order_id).toBe('ORD-123_test');
      expect(result.status).toBe('SUCCESSscript'); // special chars removed
    });

    it('should limit field length', () => {
      const query = {
        order_id: 'a'.repeat(200)
      };
      const result = sanitizeCallbackData(query, ['order_id']);
      expect(result.order_id.length).toBe(100);
    });
  });

  describe('maskSensitiveData', () => {
    it('should mask sensitive fields', () => {
      const data = {
        consumerKey: 'my-key',
        consumerSecret: 'my-secret',
        token: 'jwt-token',
        amount: 10000
      };
      const masked = maskSensitiveData(data) as Record<string, unknown>;

      expect(masked.consumerKey).toBe('***MASKED***');
      expect(masked.consumerSecret).toBe('***MASKED***');
      expect(masked.token).toBe('***MASKED***');
      expect(masked.amount).toBe(10000);
    });

    it('should handle nested objects', () => {
      const data = {
        credentials: {
          apiKey: 'secret-key',
          user: 'john'
        }
      };
      const masked = maskSensitiveData(data) as any;

      expect(masked.credentials.apiKey).toBe('***MASKED***');
      expect(masked.credentials.user).toBe('john');
    });

    it('should handle arrays', () => {
      const data = [
        { password: 'secret1' },
        { password: 'secret2' }
      ];
      const masked = maskSensitiveData(data) as any[];

      expect(masked[0].password).toBe('***MASKED***');
      expect(masked[1].password).toBe('***MASKED***');
    });

    it('should handle null and undefined', () => {
      expect(maskSensitiveData(null)).toBeNull();
      expect(maskSensitiveData(undefined)).toBeUndefined();
    });

    it('should return strings unchanged', () => {
      expect(maskSensitiveData('hello')).toBe('hello');
    });
  });
});
