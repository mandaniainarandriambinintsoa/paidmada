/**
 * PaidMada - Classe principale pour l'API de paiement unifiée
 * Centralise MVola, Orange Money et Airtel Money
 */

import {
  Provider,
  PaidMadaConfig,
  PaymentRequest,
  PaymentResponse,
  TransactionStatusRequest,
  TransactionDetails,
  PaymentError,
  CallbackPayload,
  TransactionStatus
} from './types';
import { MVolaProvider } from './providers/mvola';
import { OrangeMoneyProvider } from './providers/orange-money';
import { AirtelMoneyProvider } from './providers/airtel-money';
import { MockProvider } from './providers/mock';
import { BaseProvider } from './providers/base';
import { validatePhone } from './utils/phone';
import { logger } from './utils/logger';

// Type unifié pour les providers (réels ou mock)
type AnyProvider = BaseProvider | MockProvider;

export class PaidMada {
  private providers: Map<Provider, AnyProvider> = new Map();
  private mockProviders: Map<Provider, MockProvider> = new Map();
  private config: PaidMadaConfig;
  private isMockMode: boolean = false;

  constructor(config: PaidMadaConfig) {
    this.config = config;
    this.initializeProviders();
  }

  /**
   * Initialise les providers configurés
   */
  private initializeProviders(): void {
    const sandbox = this.config.sandbox ?? true;

    // Mode Mock activé ?
    if (this.config.mockMode?.enabled) {
      this.isMockMode = true;
      this.initializeMockProviders();
      return;
    }

    // MVola
    if (this.config.mvola) {
      const mvola = new MVolaProvider({
        ...this.config.mvola,
        sandbox
      });
      this.providers.set(Provider.MVOLA, mvola);
      logger.info('MVola provider initialized');
    }

    // Orange Money
    if (this.config.orangeMoney) {
      const orange = new OrangeMoneyProvider({
        ...this.config.orangeMoney,
        sandbox
      });
      orange.setCallbackUrls({
        returnUrl: `${this.config.callbackBaseUrl}/orange/return`,
        cancelUrl: `${this.config.callbackBaseUrl}/orange/cancel`,
        notifUrl: `${this.config.callbackBaseUrl}/orange/notify`
      });
      this.providers.set(Provider.ORANGE_MONEY, orange);
      logger.info('Orange Money provider initialized');
    }

    // Airtel Money
    if (this.config.airtelMoney) {
      const airtel = new AirtelMoneyProvider({
        ...this.config.airtelMoney,
        sandbox
      });
      this.providers.set(Provider.AIRTEL_MONEY, airtel);
      logger.info('Airtel Money provider initialized');
    }
  }

  /**
   * Initialise les mock providers pour tous les opérateurs
   */
  private initializeMockProviders(): void {
    const mockConfig = this.config.mockMode!;

    logger.info('========================================');
    logger.info('  MODE MOCK ACTIF - Aucun appel réel');
    logger.info('========================================');

    // Créer un mock pour chaque provider
    const allProviders = [Provider.MVOLA, Provider.ORANGE_MONEY, Provider.AIRTEL_MONEY];

    for (const provider of allProviders) {
      const mock = new MockProvider({
        provider,
        successRate: mockConfig.successRate,
        responseDelay: mockConfig.responseDelay,
        simulatePending: mockConfig.simulatePending
      });
      this.providers.set(provider, mock);
      this.mockProviders.set(provider, mock);
    }

    logger.info('All mock providers initialized', {
      successRate: mockConfig.successRate ?? 90,
      simulatePending: mockConfig.simulatePending ?? true
    });
  }

  /**
   * Vérifie si le mode mock est actif
   */
  isInMockMode(): boolean {
    return this.isMockMode;
  }

  /**
   * Obtient un provider
   */
  private getProvider(provider: Provider): AnyProvider {
    const p = this.providers.get(provider);
    if (!p) {
      throw new PaymentError(
        `Provider ${provider} non configuré`,
        'PROVIDER_NOT_CONFIGURED',
        provider
      );
    }
    return p;
  }

  /**
   * Vérifie si un provider est disponible
   */
  hasProvider(provider: Provider): boolean {
    return this.providers.has(provider);
  }

  /**
   * Liste les providers disponibles
   */
  getAvailableProviders(): Provider[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Détecte automatiquement le provider depuis le numéro de téléphone
   */
  detectProvider(phone: string): Provider | null {
    const validation = validatePhone(phone);
    if (validation.isValid && validation.provider) {
      return validation.provider;
    }
    return null;
  }

  /**
   * Initie un paiement
   * @param request - Requête de paiement
   */
  async pay(request: PaymentRequest): Promise<PaymentResponse> {
    // Auto-détection du provider si non spécifié
    let provider = request.provider;
    if (!provider) {
      const detected = this.detectProvider(request.customerPhone);
      if (!detected) {
        throw new PaymentError(
          'Impossible de détecter le provider depuis le numéro',
          'PROVIDER_DETECTION_FAILED'
        );
      }
      provider = detected;
      logger.info(`Provider auto-détecté: ${provider}`);
    }

    // Validation du numéro
    const phoneValidation = validatePhone(request.customerPhone);
    if (!phoneValidation.isValid) {
      throw new PaymentError(
        phoneValidation.error || 'Numéro de téléphone invalide',
        'INVALID_PHONE'
      );
    }

    // Vérifier que le provider est disponible
    const providerInstance = this.getProvider(provider);

    // Exécuter le paiement
    logger.info(`Initiating payment with ${provider}`, {
      amount: request.amount,
      phone: request.customerPhone.slice(0, 6) + '****'
    });

    return providerInstance.initiatePayment({ ...request, provider });
  }

  /**
   * Paiement intelligent - choisit automatiquement le provider
   */
  async smartPay(
    customerPhone: string,
    amount: number,
    options?: {
      description?: string;
      reference?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<PaymentResponse> {
    const provider = this.detectProvider(customerPhone);
    if (!provider) {
      throw new PaymentError(
        'Numéro de téléphone non reconnu',
        'UNKNOWN_PHONE_NUMBER'
      );
    }

    if (!this.hasProvider(provider)) {
      throw new PaymentError(
        `Le provider ${provider} n'est pas configuré`,
        'PROVIDER_NOT_CONFIGURED',
        provider
      );
    }

    return this.pay({
      provider,
      customerPhone,
      amount,
      ...options
    });
  }

  /**
   * Vérifie le statut d'une transaction
   */
  async getStatus(request: TransactionStatusRequest): Promise<TransactionDetails> {
    const provider = this.getProvider(request.provider);
    return provider.getTransactionStatus(request);
  }

  /**
   * Traite un callback de paiement
   */
  parseCallback(provider: Provider, payload: unknown): CallbackPayload {
    switch (provider) {
      case Provider.MVOLA:
        return this.parseMVolaCallback(payload);
      case Provider.ORANGE_MONEY:
        return this.parseOrangeCallback(payload);
      case Provider.AIRTEL_MONEY:
        return this.parseAirtelCallback(payload);
      default:
        throw new PaymentError('Provider inconnu', 'UNKNOWN_PROVIDER');
    }
  }

  private parseMVolaCallback(payload: unknown): CallbackPayload {
    const data = payload as Record<string, unknown>;
    return {
      provider: Provider.MVOLA,
      transactionId: data.transactionReference as string || '',
      serverCorrelationId: data.serverCorrelationId as string,
      status: this.mapMVolaStatus(data.status as string || data.transactionStatus as string),
      amount: parseFloat(data.amount as string) || 0,
      currency: 'MGA',
      customerPhone: (data.debitParty as Array<{value: string}>)?.[0]?.value,
      reference: data.originalTransactionReference as string,
      timestamp: new Date().toISOString(),
      rawPayload: payload
    };
  }

  private parseOrangeCallback(payload: unknown): CallbackPayload {
    const data = payload as Record<string, unknown>;
    return {
      provider: Provider.ORANGE_MONEY,
      transactionId: data.order_id as string || '',
      serverCorrelationId: data.txnid as string,
      status: this.mapOrangeStatus(data.status as string),
      amount: parseFloat(data.amount as string) || 0,
      currency: 'MGA',
      reference: data.order_id as string,
      timestamp: new Date().toISOString(),
      rawPayload: payload
    };
  }

  private parseAirtelCallback(payload: unknown): CallbackPayload {
    const data = payload as Record<string, unknown>;
    const transaction = (data.transaction || data) as Record<string, unknown>;
    return {
      provider: Provider.AIRTEL_MONEY,
      transactionId: transaction.id as string || '',
      serverCorrelationId: transaction.airtel_money_id as string,
      status: this.mapAirtelStatus(transaction.status as string),
      amount: parseFloat(transaction.amount as string) || 0,
      currency: 'MGA',
      customerPhone: transaction.msisdn as string,
      reference: transaction.id as string,
      timestamp: new Date().toISOString(),
      rawPayload: payload
    };
  }

  private mapMVolaStatus(status: string): TransactionStatus {
    const map: Record<string, TransactionStatus> = {
      'success': TransactionStatus.SUCCESS,
      'completed': TransactionStatus.SUCCESS,
      'pending': TransactionStatus.PENDING,
      'failed': TransactionStatus.FAILED
    };
    return map[status?.toLowerCase()] || TransactionStatus.PENDING;
  }

  private mapOrangeStatus(status: string): TransactionStatus {
    const map: Record<string, TransactionStatus> = {
      'SUCCESS': TransactionStatus.SUCCESS,
      'PENDING': TransactionStatus.PENDING,
      'FAILED': TransactionStatus.FAILED,
      'EXPIRED': TransactionStatus.EXPIRED
    };
    return map[status?.toUpperCase()] || TransactionStatus.PENDING;
  }

  private mapAirtelStatus(status: string): TransactionStatus {
    if (status === 'TS' || status === 'successful' || status === 'success') {
      return TransactionStatus.SUCCESS;
    }
    if (status === 'TIP' || status === 'pending') {
      return TransactionStatus.PENDING;
    }
    if (status === 'TF' || status === 'failed') {
      return TransactionStatus.FAILED;
    }
    return TransactionStatus.PENDING;
  }
}
