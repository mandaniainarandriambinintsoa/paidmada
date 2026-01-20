/**
 * Tests pour le MockProvider
 */

import { MockProvider } from '../src/providers/mock';
import { Provider, TransactionStatus } from '../src/types';

describe('MockProvider', () => {
  let mockProvider: MockProvider;

  beforeEach(() => {
    mockProvider = new MockProvider({
      provider: Provider.MVOLA,
      successRate: 100, // Always succeed for predictable tests
      responseDelay: 0,
      simulatePending: false
    });
  });

  afterEach(() => {
    mockProvider.clearTransactions();
  });

  describe('authenticate', () => {
    it('should authenticate successfully', async () => {
      await expect(mockProvider.authenticate()).resolves.not.toThrow();
    });
  });

  describe('initiatePayment', () => {
    it('should initiate a payment and return transaction details', async () => {
      const result = await mockProvider.initiatePayment({
        provider: Provider.MVOLA,
        amount: 10000,
        customerPhone: '0341234567',
        description: 'Test payment'
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe(Provider.MVOLA);
      expect(result.transactionId).toMatch(/^MOCK-TXN-/);
      expect(result.serverCorrelationId).toMatch(/^CORR-/);
      expect(result.status).toBe(TransactionStatus.SUCCESS);
    });

    it('should store transaction for later retrieval', async () => {
      const paymentResult = await mockProvider.initiatePayment({
        provider: Provider.MVOLA,
        amount: 5000,
        customerPhone: '0341234567'
      });

      const statusResult = await mockProvider.getTransactionStatus({
        provider: Provider.MVOLA,
        transactionId: paymentResult.transactionId
      });

      expect(statusResult.transactionId).toBe(paymentResult.transactionId);
      expect(statusResult.amount).toBe(5000);
    });

    it('should include paymentUrl for Orange Money', async () => {
      const orangeProvider = new MockProvider({
        provider: Provider.ORANGE_MONEY,
        successRate: 100,
        responseDelay: 0,
        simulatePending: false
      });

      const result = await orangeProvider.initiatePayment({
        provider: Provider.ORANGE_MONEY,
        amount: 10000,
        customerPhone: '0321234567'
      });

      expect(result.paymentUrl).toBeDefined();
      expect(result.paymentUrl).toContain('mock.orange.com');
    });
  });

  describe('getTransactionStatus', () => {
    it('should return transaction status', async () => {
      const payment = await mockProvider.initiatePayment({
        provider: Provider.MVOLA,
        amount: 10000,
        customerPhone: '0341234567',
        description: 'Test',
        reference: 'REF-001'
      });

      const status = await mockProvider.getTransactionStatus({
        provider: Provider.MVOLA,
        transactionId: payment.transactionId
      });

      expect(status.transactionId).toBe(payment.transactionId);
      expect(status.amount).toBe(10000);
      expect(status.customerPhone).toBe('0341234567');
      expect(status.description).toBe('Test');
      expect(status.reference).toBe('REF-001');
    });

    it('should return failed status for unknown transaction', async () => {
      const status = await mockProvider.getTransactionStatus({
        provider: Provider.MVOLA,
        transactionId: 'UNKNOWN-TXN'
      });

      expect(status.status).toBe(TransactionStatus.FAILED);
      expect(status.amount).toBe(0);
    });
  });

  describe('simulatePending mode', () => {
    it('should return pending status initially when simulatePending is true', async () => {
      const pendingProvider = new MockProvider({
        provider: Provider.MVOLA,
        successRate: 100,
        responseDelay: 0,
        simulatePending: true
      });

      const result = await pendingProvider.initiatePayment({
        provider: Provider.MVOLA,
        amount: 10000,
        customerPhone: '0341234567'
      });

      expect(result.status).toBe(TransactionStatus.PENDING);
    });
  });

  describe('successRate', () => {
    it('should fail some transactions when successRate < 100', async () => {
      const lowSuccessProvider = new MockProvider({
        provider: Provider.MVOLA,
        successRate: 0, // Always fail
        responseDelay: 0,
        simulatePending: false
      });

      const result = await lowSuccessProvider.initiatePayment({
        provider: Provider.MVOLA,
        amount: 10000,
        customerPhone: '0341234567'
      });

      expect(result.status).toBe(TransactionStatus.FAILED);
    });
  });

  describe('setTransactionStatus', () => {
    it('should manually set transaction status', async () => {
      const payment = await mockProvider.initiatePayment({
        provider: Provider.MVOLA,
        amount: 10000,
        customerPhone: '0341234567'
      });

      const updated = mockProvider.setTransactionStatus(
        payment.transactionId,
        TransactionStatus.CANCELLED
      );

      expect(updated).toBe(true);

      const status = await mockProvider.getTransactionStatus({
        provider: Provider.MVOLA,
        transactionId: payment.transactionId
      });

      expect(status.status).toBe(TransactionStatus.CANCELLED);
    });

    it('should return false for unknown transaction', () => {
      const result = mockProvider.setTransactionStatus(
        'UNKNOWN-TXN',
        TransactionStatus.SUCCESS
      );

      expect(result).toBe(false);
    });
  });

  describe('clearTransactions', () => {
    it('should clear all stored transactions', async () => {
      await mockProvider.initiatePayment({
        provider: Provider.MVOLA,
        amount: 10000,
        customerPhone: '0341234567'
      });

      mockProvider.clearTransactions();

      const status = await mockProvider.getTransactionStatus({
        provider: Provider.MVOLA,
        transactionId: 'any-id'
      });

      expect(status.status).toBe(TransactionStatus.FAILED);
    });
  });
});
