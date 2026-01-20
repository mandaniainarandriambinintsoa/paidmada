/**
 * Utilitaires cryptographiques
 */

import crypto from 'crypto';

/**
 * Génère un ID de corrélation unique
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Génère une référence de transaction unique
 */
export function generateTransactionReference(prefix: string = 'TXN'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Encode en Base64
 */
export function toBase64(str: string): string {
  return Buffer.from(str).toString('base64');
}

/**
 * Décode du Base64
 */
export function fromBase64(str: string): string {
  return Buffer.from(str, 'base64').toString('utf-8');
}

/**
 * Crée une signature HMAC-SHA256
 */
export function createHmacSignature(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Vérifie une signature HMAC-SHA256
 */
export function verifyHmacSignature(data: string, signature: string, secret: string): boolean {
  const expectedSignature = createHmacSignature(data, secret);

  // Vérifier d'abord la longueur pour éviter RangeError avec timingSafeEqual
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Chiffrement RSA pour Airtel Money
 */
export function encryptWithPublicKey(data: string, publicKey: string): string {
  const buffer = Buffer.from(data, 'utf-8');
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PADDING
    },
    buffer
  );
  return encrypted.toString('base64');
}

/**
 * Comparaison timing-safe de deux chaînes
 * Protège contre les timing attacks
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  // Utiliser une longueur fixe pour éviter les timing attacks basés sur la longueur
  const aBuffer = Buffer.from(a.padEnd(256, '\0'));
  const bBuffer = Buffer.from(b.padEnd(256, '\0'));

  try {
    return crypto.timingSafeEqual(aBuffer, bBuffer) && a.length === b.length;
  } catch {
    return false;
  }
}

/**
 * Sanitize une chaîne pour éviter les injections XSS
 * Garde uniquement les caractères alphanumériques et quelques symboles sûrs
 */
export function sanitizeForHtml(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .slice(0, 200); // Limiter la longueur
}

/**
 * Sanitize un objet pour l'inclure en JSON dans du HTML
 * Retourne uniquement les champs whitelistés et sanitizés
 */
export function sanitizeCallbackData(query: Record<string, unknown>, allowedFields: string[]): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const field of allowedFields) {
    if (query[field] !== undefined) {
      const value = String(query[field]);
      // Garde uniquement alphanumérique, tirets et underscores
      sanitized[field] = value.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 100);
    }
  }

  return sanitized;
}

/**
 * Masque les données sensibles pour le logging
 */
export function maskSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item));
  }

  if (typeof data === 'object') {
    const masked: Record<string, unknown> = {};
    const sensitiveKeys = [
      'password', 'secret', 'token', 'accessToken', 'access_token',
      'consumerKey', 'consumerSecret', 'clientSecret', 'client_secret',
      'apiKey', 'api_key', 'privateKey', 'private_key', 'publicKey',
      'authorization', 'Authorization', 'X-API-Key', 'pin', 'PIN'
    ];

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        masked[key] = '***MASKED***';
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = maskSensitiveData(value);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  return data;
}
