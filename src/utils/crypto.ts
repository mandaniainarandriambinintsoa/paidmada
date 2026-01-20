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
