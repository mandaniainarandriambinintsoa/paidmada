/**
 * Tests pour les schémas de validation Zod
 */

import {
  PaymentRequestSchema,
  StatusRequestSchema,
  SmartPayRequestSchema,
  MVolaCallbackSchema,
  OrangeCallbackSchema,
  AirtelCallbackSchema
} from '../src/validation/schemas';
import { Provider } from '../src/types';

describe('Validation Schemas', () => {
  describe('PaymentRequestSchema', () => {
    it('should validate a complete payment request', () => {
      const data = {
        provider: Provider.MVOLA,
        amount: 10000,
        customerPhone: '0341234567',
        description: 'Test payment',
        reference: 'REF001'
      };

      const result = PaymentRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should validate with minimal required fields', () => {
      const data = {
        amount: 100,
        customerPhone: '0341234567'
      };

      const result = PaymentRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject amount below minimum', () => {
      const data = {
        amount: 50, // minimum is 100
        customerPhone: '0341234567'
      };

      const result = PaymentRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject negative amount', () => {
      const data = {
        amount: -100,
        customerPhone: '0341234567'
      };

      const result = PaymentRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject invalid phone number', () => {
      const data = {
        amount: 10000,
        customerPhone: '1234567890' // doesn't start with 03
      };

      const result = PaymentRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should normalize phone number with spaces', () => {
      const data = {
        amount: 10000,
        customerPhone: '034 12 345 67'
      };

      const result = PaymentRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject description too long', () => {
      const data = {
        amount: 10000,
        customerPhone: '0341234567',
        description: 'a'.repeat(101) // max is 100
      };

      const result = PaymentRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should validate with metadata', () => {
      const data = {
        amount: 10000,
        customerPhone: '0341234567',
        metadata: {
          orderId: '12345',
          userId: 'user001'
        }
      };

      const result = PaymentRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('StatusRequestSchema', () => {
    it('should validate status request', () => {
      const data = {
        provider: Provider.MVOLA,
        transactionId: 'TXN-123456'
      };

      const result = StatusRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should validate with serverCorrelationId', () => {
      const data = {
        provider: Provider.ORANGE_MONEY,
        transactionId: 'TXN-123456',
        serverCorrelationId: 'CORR-789'
      };

      const result = StatusRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty transactionId', () => {
      const data = {
        provider: Provider.MVOLA,
        transactionId: ''
      };

      const result = StatusRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject invalid provider', () => {
      const data = {
        provider: 'invalid_provider',
        transactionId: 'TXN-123456'
      };

      const result = StatusRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('SmartPayRequestSchema', () => {
    it('should validate smart pay request', () => {
      const data = {
        phone: '0341234567',
        amount: 5000
      };

      const result = SmartPayRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should validate with all optional fields', () => {
      const data = {
        phone: '0321234567',
        amount: 10000,
        description: 'Achat produit',
        reference: 'CMD-001',
        metadata: { key: 'value' }
      };

      const result = SmartPayRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('Callback Schemas', () => {
    describe('MVolaCallbackSchema', () => {
      it('should validate MVola callback', () => {
        const data = {
          transactionReference: 'TXN-123',
          serverCorrelationId: 'CORR-456',
          status: 'success',
          amount: '10000'
        };

        const result = MVolaCallbackSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('should allow extra fields (passthrough)', () => {
        const data = {
          transactionReference: 'TXN-123',
          status: 'success',
          customField: 'custom value'
        };

        const result = MVolaCallbackSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.customField).toBe('custom value');
        }
      });
    });

    describe('OrangeCallbackSchema', () => {
      it('should validate Orange callback', () => {
        const data = {
          order_id: 'ORD-123',
          txnid: 'TXN-456',
          status: 'SUCCESS',
          amount: 5000
        };

        const result = OrangeCallbackSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('should accept amount as string or number', () => {
        const dataString = { amount: '5000' };
        const dataNumber = { amount: 5000 };

        expect(OrangeCallbackSchema.safeParse(dataString).success).toBe(true);
        expect(OrangeCallbackSchema.safeParse(dataNumber).success).toBe(true);
      });
    });

    describe('AirtelCallbackSchema', () => {
      it('should validate Airtel callback', () => {
        const data = {
          transaction: {
            id: 'TXN-123',
            airtel_money_id: 'AM-456',
            status: 'TS',
            amount: '10000',
            msisdn: '331234567'
          }
        };

        const result = AirtelCallbackSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('should validate without transaction object', () => {
        const data = {};

        const result = AirtelCallbackSchema.safeParse(data);
        expect(result.success).toBe(true);
      });
    });
  });
});
