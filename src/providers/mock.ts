/**
 * MockProvider - Provider de simulation pour les tests
 * Permet de tester l'API sans credentials réels
 */

import {
  Provider,
  PaymentRequest,
  PaymentResponse,
  TransactionStatusRequest,
  TransactionDetails,
  TransactionStatus,
  TransactionType
} from '../types';
import { logger } from '../utils/logger';
import { generateTransactionReference } from '../utils/crypto';

export interface MockConfig {
  /** Provider à simuler */
  provider: Provider;
  /** Délai de réponse simulé en ms (défaut: 500-1500ms aléatoire) */
  responseDelay?: number;
  /** Taux de succès en pourcentage (défaut: 90) */
  successRate?: number;
  /** Simule le statut pending avant success (défaut: true) */
  simulatePending?: boolean;
}

interface StoredTransaction {
  request: PaymentRequest;
  response: PaymentResponse;
  status: TransactionStatus;
  createdAt: Date;
  completedAt?: Date;
}

export class MockProvider {
  private provider: Provider;
  private responseDelay: number;
  private successRate: number;
  private simulatePending: boolean;

  // Stockage en mémoire des transactions pour getStatus
  private transactions: Map<string, StoredTransaction> = new Map();

  constructor(config: MockConfig) {
    this.provider = config.provider;
    this.responseDelay = config.responseDelay ?? 0; // 0 = aléatoire
    this.successRate = config.successRate ?? 90;
    this.simulatePending = config.simulatePending ?? true;

    logger.info(`[MOCK] ${this.provider} provider initialized`, {
      successRate: this.successRate,
      simulatePending: this.simulatePending
    });
  }

  /**
   * Simule un délai réseau
   */
  private async delay(): Promise<void> {
    const ms = this.responseDelay || (Math.random() * 1000 + 500);
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Détermine si la transaction doit réussir
   */
  private shouldSucceed(): boolean {
    return Math.random() * 100 < this.successRate;
  }

  /**
   * Simule l'authentification
   */
  async authenticate(): Promise<void> {
    await this.delay();
    logger.info(`[MOCK] ${this.provider} authentication successful`);
  }

  /**
   * Simule l'initiation d'un paiement
   */
  async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
    await this.delay();

    const transactionId = `MOCK-${generateTransactionReference()}`;
    const serverCorrelationId = `CORR-${Date.now()}`;
    const willSucceed = this.shouldSucceed();

    // Statut initial
    const initialStatus = this.simulatePending
      ? TransactionStatus.PENDING
      : (willSucceed ? TransactionStatus.SUCCESS : TransactionStatus.FAILED);

    const response: PaymentResponse = {
      success: true,
      provider: this.provider,
      transactionId,
      serverCorrelationId,
      status: initialStatus,
      message: this.getStatusMessage(initialStatus),
      rawResponse: {
        mock: true,
        request,
        simulatedAt: new Date().toISOString()
      }
    };

    // Ajouter paymentUrl pour Orange Money (simulation)
    if (this.provider === Provider.ORANGE_MONEY) {
      response.paymentUrl = `https://mock.orange.com/pay/${transactionId}`;
    }

    // Stocker la transaction
    this.transactions.set(transactionId, {
      request,
      response,
      status: initialStatus,
      createdAt: new Date()
    });

    // Simuler la progression vers le statut final après un délai
    if (this.simulatePending) {
      setTimeout(() => {
        const tx = this.transactions.get(transactionId);
        if (tx && tx.status === TransactionStatus.PENDING) {
          tx.status = willSucceed ? TransactionStatus.SUCCESS : TransactionStatus.FAILED;
          tx.completedAt = new Date();
          logger.info(`[MOCK] Transaction ${transactionId} -> ${tx.status}`);
        }
      }, 3000); // 3 secondes pour passer de pending à final
    }

    logger.info(`[MOCK] Payment initiated`, {
      provider: this.provider,
      transactionId,
      amount: request.amount,
      phone: request.customerPhone,
      status: initialStatus
    });

    return response;
  }

  /**
   * Simule la vérification du statut
   */
  async getTransactionStatus(request: TransactionStatusRequest): Promise<TransactionDetails> {
    await this.delay();

    const tx = this.transactions.get(request.transactionId);

    if (!tx) {
      // Transaction non trouvée, simuler une réponse
      return {
        transactionId: request.transactionId,
        serverCorrelationId: request.serverCorrelationId,
        provider: this.provider,
        type: TransactionType.PAYMENT,
        status: TransactionStatus.FAILED,
        amount: 0,
        currency: 'MGA',
        description: 'Transaction non trouvée',
        createdAt: new Date().toISOString(),
        rawResponse: { mock: true, error: 'NOT_FOUND' }
      };
    }

    return {
      transactionId: request.transactionId,
      serverCorrelationId: tx.response.serverCorrelationId,
      provider: this.provider,
      type: TransactionType.PAYMENT,
      status: tx.status,
      amount: tx.request.amount,
      currency: 'MGA',
      customerPhone: tx.request.customerPhone,
      description: tx.request.description,
      reference: tx.request.reference,
      createdAt: tx.createdAt.toISOString(),
      completedAt: tx.completedAt?.toISOString(),
      rawResponse: { mock: true }
    };
  }

  /**
   * Message selon le statut
   */
  private getStatusMessage(status: TransactionStatus): string {
    const messages: Record<TransactionStatus, string> = {
      [TransactionStatus.PENDING]: 'Transaction en attente de confirmation',
      [TransactionStatus.SUCCESS]: 'Transaction réussie',
      [TransactionStatus.FAILED]: 'Transaction échouée',
      [TransactionStatus.EXPIRED]: 'Transaction expirée',
      [TransactionStatus.CANCELLED]: 'Transaction annulée'
    };
    return messages[status];
  }

  /**
   * Réinitialise les transactions (utile pour les tests)
   */
  clearTransactions(): void {
    this.transactions.clear();
    logger.info(`[MOCK] Transactions cleared for ${this.provider}`);
  }

  /**
   * Force le statut d'une transaction (utile pour les tests)
   */
  setTransactionStatus(transactionId: string, status: TransactionStatus): boolean {
    const tx = this.transactions.get(transactionId);
    if (tx) {
      tx.status = status;
      if (status !== TransactionStatus.PENDING) {
        tx.completedAt = new Date();
      }
      return true;
    }
    return false;
  }
}
