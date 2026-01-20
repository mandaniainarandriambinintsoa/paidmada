/**
 * Utilitaires pour la validation et normalisation des numéros de téléphone
 */

import { Provider, PhoneValidation, PHONE_PREFIXES } from '../types';

/**
 * Normalise un numéro de téléphone malgache
 * Accepte: 0341234567, +261341234567, 261341234567, 341234567
 */
export function normalizePhone(phone: string): string {
  // Supprimer tous les caractères non numériques
  let cleaned = phone.replace(/\D/g, '');

  // Supprimer le préfixe international 261 si présent
  if (cleaned.startsWith('261') && cleaned.length === 12) {
    cleaned = '0' + cleaned.slice(3);
  }

  // Ajouter le 0 au début si manquant
  if (cleaned.length === 9 && !cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }

  return cleaned;
}

/**
 * Valide un numéro de téléphone et détecte le provider
 */
export function validatePhone(phone: string): PhoneValidation {
  const normalized = normalizePhone(phone);

  // Vérifier la longueur (10 chiffres pour Madagascar)
  if (normalized.length !== 10) {
    return {
      isValid: false,
      error: 'Le numéro doit contenir 10 chiffres'
    };
  }

  // Vérifier que ça commence par 03
  if (!normalized.startsWith('03')) {
    return {
      isValid: false,
      error: 'Le numéro doit commencer par 03x'
    };
  }

  // Détecter le provider
  const prefix = normalized.slice(0, 3);
  let detectedProvider: Provider | undefined;

  for (const [provider, prefixes] of Object.entries(PHONE_PREFIXES)) {
    if ((prefixes as readonly string[]).includes(prefix)) {
      detectedProvider = provider as Provider;
      break;
    }
  }

  if (!detectedProvider) {
    return {
      isValid: false,
      normalizedNumber: normalized,
      error: `Préfixe ${prefix} non reconnu`
    };
  }

  return {
    isValid: true,
    provider: detectedProvider,
    normalizedNumber: normalized
  };
}

/**
 * Vérifie si un numéro appartient à un provider spécifique
 */
export function isPhoneForProvider(phone: string, provider: Provider): boolean {
  const validation = validatePhone(phone);
  return validation.isValid && validation.provider === provider;
}

/**
 * Formate un numéro pour l'affichage
 */
export function formatPhoneDisplay(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.length !== 10) return phone;

  // Format: 034 12 345 67
  return `${normalized.slice(0, 3)} ${normalized.slice(3, 5)} ${normalized.slice(5, 8)} ${normalized.slice(8)}`;
}

/**
 * Convertit en format international
 */
export function toInternationalFormat(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.startsWith('0')) {
    return '+261' + normalized.slice(1);
  }
  return '+261' + normalized;
}
