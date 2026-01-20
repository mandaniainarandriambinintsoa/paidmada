/**
 * Tests pour la classe principale PaidMada
 */

import { PaidMada } from '../src/paidmada';
import { Provider, TransactionStatus } from '../src/types';

describe('PaidMada', () => {
  let paidmada: PaidMada;

  beforeEach(() => {
    paidmada = new PaidMada({
      callbackBaseUrl: 'http://localhost:3000/api/callback',
      mockMode: {
        enabled: true,
        successRate: 100,
        responseDelay: 0,
        simulatePending: false
      }
    });
  });

  describe('initialization', () => {
    it('should initialize in mock mode', () => {
      expect(paidmada.isInMockMode()).toBe(true);
    });

    it('should have all providers available in mock mode', () => {
      const providers = paidmada.getAvailableProviders();
      expect(providers).toContain(Provider.MVOLA);
      expect(providers).toContain(Provider.ORANGE_MONEY);
      expect(providers).toContain(Provider.AIRTEL_MONEY);
    });

    it('should check if provider is available', () => {
      expect(paidmada.hasProvider(Provider.MVOLA)).toBe(true);
      expect(paidmada.hasProvider(Provider.ORANGE_MONEY)).toBe(true);
      expect(paidmada.hasProvider(Provider.AIRTEL_MONEY)).toBe(true);
    });
  });

  describe('detectProvider', () => {
    it('should detect MVola from 034 prefix', () => {
      expect(paidmada.detectProvider('0341234567')).toBe(Provider.MVOLA);
    });

    it('should detect MVola from 038 prefix', () => {
      expect(paidmada.detectProvider('0381234567')).toBe(Provider.MVOLA);
    });

    it('should detect Orange Money from 032 prefix', () => {
      expect(paidmada.detectProvider('0321234567')).toBe(Provider.ORANGE_MONEY);
    });

    it('should detect Orange Money from 037 prefix', () => {
      expect(paidmada.detectProvider('0371234567')).toBe(Provider.ORANGE_MONEY);
    });

    it('should detect Airtel Money from 033 prefix', () => {
      expect(paidmada.detectProvider('0331234567')).toBe(Provider.AIRTEL_MONEY);
    });

    it('should return null for invalid numbers', () => {
      expect(paidmada.detectProvider('invalid')).toBeNull();
      expect(paidmada.detectProvider('0441234567')).toBeNull();
    });
  });

  describe('pay', () => {
    it('should process payment with explicit provider', async () => {
      const result = await paidmada.pay({
        provider: Provider.MVOLA,
        amount: 10000,
        customerPhone: '0341234567',
        description: 'Test payment'
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe(Provider.MVOLA);
      expect(result.transactionId).toBeDefined();
    });

    it('should auto-detect provider from phone number', async () => {
      const result = await paidmada.pay({
        provider: undefined as any, // Force auto-detection
        amount: 5000,
        customerPhone: '0321234567'
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe(Provider.ORANGE_MONEY);
    });

    it('should throw error for invalid phone number', async () => {
      await expect(
        paidmada.pay({
          provider: Provider.MVOLA,
          amount: 10000,
          customerPhone: 'invalid'
        })
      ).rejects.toThrow();
    });
  });

  describe('smartPay', () => {
    it('should process payment with auto-detection', async () => {
      const result = await paidmada.smartPay('0341234567', 10000, {
        description: 'Smart payment test'
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe(Provider.MVOLA);
    });

    it('should work with all providers', async () => {
      const mvolaResult = await paidmada.smartPay('0341234567', 1000);
      expect(mvolaResult.provider).toBe(Provider.MVOLA);

      const orangeResult = await paidmada.smartPay('0321234567', 2000);
      expect(orangeResult.provider).toBe(Provider.ORANGE_MONEY);

      const airtelResult = await paidmada.smartPay('0331234567', 3000);
      expect(airtelResult.provider).toBe(Provider.AIRTEL_MONEY);
    });

    it('should throw error for unrecognized phone', async () => {
      await expect(
        paidmada.smartPay('0441234567', 10000)
      ).rejects.toThrow('non reconnu');
    });
  });

  describe('getStatus', () => {
    it('should get transaction status', async () => {
      const payment = await paidmada.smartPay('0341234567', 10000);

      const status = await paidmada.getStatus({
        provider: Provider.MVOLA,
        transactionId: payment.transactionId
      });

      expect(status.transactionId).toBe(payment.transactionId);
      expect(status.amount).toBe(10000);
    });
  });

  describe('parseCallback', () => {
    it('should parse MVola callback', () => {
      const payload = {
        transactionReference: 'TXN-123',
        serverCorrelationId: 'CORR-456',
        status: 'success',
        amount: '10000',
        debitParty: [{ value: '0341234567' }]
      };

      const result = paidmada.parseCallback(Provider.MVOLA, payload);

      expect(result.provider).toBe(Provider.MVOLA);
      expect(result.transactionId).toBe('TXN-123');
      expect(result.status).toBe(TransactionStatus.SUCCESS);
      expect(result.amount).toBe(10000);
    });

    it('should parse Orange Money callback', () => {
      const payload = {
        order_id: 'ORD-123',
        txnid: 'TXN-456',
        status: 'SUCCESS',
        amount: '5000'
      };

      const result = paidmada.parseCallback(Provider.ORANGE_MONEY, payload);

      expect(result.provider).toBe(Provider.ORANGE_MONEY);
      expect(result.transactionId).toBe('ORD-123');
      expect(result.status).toBe(TransactionStatus.SUCCESS);
    });

    it('should parse Airtel Money callback', () => {
      const payload = {
        transaction: {
          id: 'TXN-123',
          airtel_money_id: 'AM-456',
          status: 'TS',
          amount: '15000',
          msisdn: '331234567'
        }
      };

      const result = paidmada.parseCallback(Provider.AIRTEL_MONEY, payload);

      expect(result.provider).toBe(Provider.AIRTEL_MONEY);
      expect(result.transactionId).toBe('TXN-123');
      expect(result.status).toBe(TransactionStatus.SUCCESS);
    });

    it('should map various status strings correctly', () => {
      // MVola statuses
      expect(
        paidmada.parseCallback(Provider.MVOLA, { status: 'completed' }).status
      ).toBe(TransactionStatus.SUCCESS);

      expect(
        paidmada.parseCallback(Provider.MVOLA, { status: 'pending' }).status
      ).toBe(TransactionStatus.PENDING);

      expect(
        paidmada.parseCallback(Provider.MVOLA, { status: 'failed' }).status
      ).toBe(TransactionStatus.FAILED);

      // Orange statuses
      expect(
        paidmada.parseCallback(Provider.ORANGE_MONEY, { status: 'EXPIRED' }).status
      ).toBe(TransactionStatus.EXPIRED);

      // Airtel statuses
      expect(
        paidmada.parseCallback(Provider.AIRTEL_MONEY, { transaction: { status: 'TIP' } }).status
      ).toBe(TransactionStatus.PENDING);

      expect(
        paidmada.parseCallback(Provider.AIRTEL_MONEY, { transaction: { status: 'TF' } }).status
      ).toBe(TransactionStatus.FAILED);
    });
  });
});
