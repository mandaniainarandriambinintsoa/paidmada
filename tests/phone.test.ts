/**
 * Tests pour les utilitaires de téléphone
 */

import {
  normalizePhone,
  validatePhone,
  isPhoneForProvider,
  formatPhoneDisplay,
  toInternationalFormat
} from '../src/utils/phone';
import { Provider } from '../src/types';

describe('Phone Utils', () => {
  describe('normalizePhone', () => {
    it('should keep valid 10-digit numbers unchanged', () => {
      expect(normalizePhone('0341234567')).toBe('0341234567');
    });

    it('should remove non-numeric characters', () => {
      expect(normalizePhone('034 12 345 67')).toBe('0341234567');
      expect(normalizePhone('034-12-345-67')).toBe('0341234567');
      expect(normalizePhone('+261341234567')).toBe('0341234567');
    });

    it('should convert international format (261) to local', () => {
      expect(normalizePhone('261341234567')).toBe('0341234567');
    });

    it('should add leading 0 for 9-digit numbers', () => {
      expect(normalizePhone('341234567')).toBe('0341234567');
    });
  });

  describe('validatePhone', () => {
    describe('MVola numbers (034, 038)', () => {
      it('should validate 034 prefix as MVola', () => {
        const result = validatePhone('0341234567');
        expect(result.isValid).toBe(true);
        expect(result.provider).toBe(Provider.MVOLA);
        expect(result.normalizedNumber).toBe('0341234567');
      });

      it('should validate 038 prefix as MVola', () => {
        const result = validatePhone('0381234567');
        expect(result.isValid).toBe(true);
        expect(result.provider).toBe(Provider.MVOLA);
      });
    });

    describe('Orange Money numbers (032, 037)', () => {
      it('should validate 032 prefix as Orange Money', () => {
        const result = validatePhone('0321234567');
        expect(result.isValid).toBe(true);
        expect(result.provider).toBe(Provider.ORANGE_MONEY);
      });

      it('should validate 037 prefix as Orange Money', () => {
        const result = validatePhone('0371234567');
        expect(result.isValid).toBe(true);
        expect(result.provider).toBe(Provider.ORANGE_MONEY);
      });
    });

    describe('Airtel Money numbers (033)', () => {
      it('should validate 033 prefix as Airtel Money', () => {
        const result = validatePhone('0331234567');
        expect(result.isValid).toBe(true);
        expect(result.provider).toBe(Provider.AIRTEL_MONEY);
      });
    });

    describe('Invalid numbers', () => {
      it('should reject numbers with wrong length', () => {
        const result = validatePhone('034123456'); // 9 digits after normalization issues
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('10 chiffres');
      });

      it('should reject numbers not starting with 03', () => {
        const result = validatePhone('0441234567');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('03x');
      });

      it('should reject unknown prefixes', () => {
        const result = validatePhone('0351234567');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('non reconnu');
      });
    });
  });

  describe('isPhoneForProvider', () => {
    it('should return true for matching provider', () => {
      expect(isPhoneForProvider('0341234567', Provider.MVOLA)).toBe(true);
      expect(isPhoneForProvider('0321234567', Provider.ORANGE_MONEY)).toBe(true);
      expect(isPhoneForProvider('0331234567', Provider.AIRTEL_MONEY)).toBe(true);
    });

    it('should return false for non-matching provider', () => {
      expect(isPhoneForProvider('0341234567', Provider.ORANGE_MONEY)).toBe(false);
      expect(isPhoneForProvider('0321234567', Provider.MVOLA)).toBe(false);
    });

    it('should return false for invalid numbers', () => {
      expect(isPhoneForProvider('invalid', Provider.MVOLA)).toBe(false);
    });
  });

  describe('formatPhoneDisplay', () => {
    it('should format phone number for display', () => {
      expect(formatPhoneDisplay('0341234567')).toBe('034 12 345 67');
    });

    it('should handle international format', () => {
      expect(formatPhoneDisplay('+261341234567')).toBe('034 12 345 67');
    });

    it('should return original for invalid numbers', () => {
      expect(formatPhoneDisplay('invalid')).toBe('invalid');
    });
  });

  describe('toInternationalFormat', () => {
    it('should convert local to international format', () => {
      expect(toInternationalFormat('0341234567')).toBe('+261341234567');
    });

    it('should handle numbers without leading 0', () => {
      expect(toInternationalFormat('341234567')).toBe('+261341234567');
    });
  });
});
