/**
 * Provider Orange Money
 * Documentation: https://developer.orange.com/apis/om-webpay
 */

import { BaseProvider } from './base';
import {
  Provider,
  OrangeMoneyConfig,
  PaymentRequest,
  PaymentResponse,
  TransactionStatusRequest,
  TransactionDetails,
  TransactionStatus,
  TransactionType,
  PaymentError
} from '../types';
import { toBase64, generateTransactionReference } from '../utils/crypto';
import { normalizePhone } from '../utils/phone';
import { logger } from '../utils/logger';

export class OrangeMoneyProvider extends BaseProvider {
  protected provider = Provider.ORANGE_MONEY;
  protected baseUrlSandbox = 'https://api.orange.com/orange-money-webpay/dev/v1';
  protected baseUrlProduction = 'https://api.orange.com/orange-money-webpay/mg/v1';

  private config: OrangeMoneyConfig;
  private callbackUrls: {
    returnUrl?: string;
    cancelUrl?: string;
    notifUrl?: string;
  } = {};

  constructor(config: OrangeMoneyConfig) {
    super(config.sandbox ?? true);
    this.config = config;
  }

  /**
   * Configure les URLs de callback
   */
  setCallbackUrls(urls: { returnUrl?: string; cancelUrl?: string; notifUrl?: string }) {
    this.callbackUrls = urls;
  }

  /**
   * Authentification OAuth2
   */
  async authenticate(): Promise<void> {
    try {
      const credentials = toBase64(`${this.config.clientId}:${this.config.clientSecret}`);

      const response = await this.httpClient.post(
        'https://api.orange.com/oauth/v3/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.token = {
        accessToken: response.data.access_token,
        tokenType: response.data.token_type,
        expiresIn: response.data.expires_in,
        expiresAt: Date.now() + (response.data.expires_in * 1000),
        scope: response.data.scope
      };

      logger.info('[OrangeMoney] Authentication successful');
    } catch (error) {
      this.handleError(error, 'authenticate');
    }
  }

  /**
   * Initie un paiement Web Payment
   * Retourne une URL de paiement pour redirection
   */
  async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const accessToken = await this.getValidToken();
      const reference = request.reference || generateTransactionReference('OM');

      const payload = {
        merchant_key: this.config.merchantKey,
        currency: 'OUV', // Orange Universal Value
        order_id: reference,
        amount: request.amount,
        return_url: this.callbackUrls.returnUrl || request.callbackUrl || '',
        cancel_url: this.callbackUrls.cancelUrl || request.callbackUrl || '',
        notif_url: this.callbackUrls.notifUrl || request.callbackUrl || '',
        lang: 'fr',
        reference: request.description || 'Paiement PaidMada'
      };

      const response = await this.httpClient.post(
        `${this.baseUrl}/webpayment`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const success = response.data.status === 201 || response.data.message === 'OK';

      return {
        success,
        provider: Provider.ORANGE_MONEY,
        transactionId: reference,
        serverCorrelationId: response.data.pay_token,
        status: success ? TransactionStatus.PENDING : TransactionStatus.FAILED,
        paymentUrl: response.data.payment_url,
        message: response.data.message,
        rawResponse: response.data
      };
    } catch (error) {
      this.handleError(error, 'initiatePayment');
    }
  }

  /**
   * Vérifie le statut d'une transaction
   */
  async getTransactionStatus(request: TransactionStatusRequest): Promise<TransactionDetails> {
    try {
      const accessToken = await this.getValidToken();

      // Orange Money nécessite order_id, amount, et pay_token pour vérifier
      const response = await this.httpClient.post(
        `${this.baseUrl}/transactionstatus`,
        {
          order_id: request.transactionId,
          pay_token: request.serverCorrelationId
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = response.data;

      return {
        transactionId: data.order_id || request.transactionId,
        serverCorrelationId: data.txnid,
        provider: Provider.ORANGE_MONEY,
        type: TransactionType.PAYMENT,
        status: this.mapStatus(data.status),
        amount: parseFloat(data.amount) || 0,
        currency: 'MGA',
        description: data.reference,
        reference: data.order_id,
        createdAt: data.created_at || new Date().toISOString(),
        completedAt: data.completed_at,
        rawResponse: data
      };
    } catch (error) {
      this.handleError(error, 'getTransactionStatus');
    }
  }

  /**
   * Mappe les statuts Orange Money vers nos statuts unifiés
   */
  private mapStatus(status: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'INITIATED': TransactionStatus.PENDING,
      'PENDING': TransactionStatus.PENDING,
      'SUCCESS': TransactionStatus.SUCCESS,
      'FAILED': TransactionStatus.FAILED,
      'EXPIRED': TransactionStatus.EXPIRED
    };

    return statusMap[status?.toUpperCase()] || TransactionStatus.PENDING;
  }
}
