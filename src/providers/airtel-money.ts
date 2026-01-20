/**
 * Provider Airtel Money
 * Documentation: https://developers.airtel.africa/
 */

import { BaseProvider } from './base';
import {
  Provider,
  AirtelMoneyConfig,
  PaymentRequest,
  PaymentResponse,
  TransactionStatusRequest,
  TransactionDetails,
  TransactionStatus,
  TransactionType,
  PaymentError
} from '../types';
import { generateTransactionReference, encryptWithPublicKey } from '../utils/crypto';
import { normalizePhone } from '../utils/phone';
import { logger } from '../utils/logger';

export class AirtelMoneyProvider extends BaseProvider {
  protected provider = Provider.AIRTEL_MONEY;
  protected baseUrlSandbox = 'https://openapiuat.airtel.africa';
  protected baseUrlProduction = 'https://openapi.airtel.africa';

  private config: AirtelMoneyConfig;
  private readonly country = 'MG'; // Madagascar
  private readonly currency = 'MGA'; // Ariary

  constructor(config: AirtelMoneyConfig) {
    super(config.sandbox ?? true);
    this.config = config;
  }

  /**
   * Authentification OAuth2
   */
  async authenticate(): Promise<void> {
    try {
      const response = await this.httpClient.post(
        `${this.baseUrl}/auth/oauth2/token`,
        {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'client_credentials'
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      this.token = {
        accessToken: response.data.access_token,
        tokenType: response.data.token_type || 'Bearer',
        expiresIn: response.data.expires_in,
        expiresAt: Date.now() + (response.data.expires_in * 1000)
      };

      logger.info('[AirtelMoney] Authentication successful');
    } catch (error) {
      this.handleError(error, 'authenticate');
    }
  }

  /**
   * Initie un paiement USSD Push (Collection)
   */
  async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const accessToken = await this.getValidToken();
      const reference = request.reference || generateTransactionReference('AIRTEL');
      const customerPhone = normalizePhone(request.customerPhone);

      // Enlever le 0 au début pour Airtel (format: 33XXXXXXX)
      const phoneWithoutZero = customerPhone.startsWith('0')
        ? customerPhone.slice(1)
        : customerPhone;

      const payload = {
        reference: reference,
        subscriber: {
          country: this.country,
          currency: this.currency,
          msisdn: phoneWithoutZero
        },
        transaction: {
          amount: request.amount,
          country: this.country,
          currency: this.currency,
          id: reference
        }
      };

      const response = await this.httpClient.post(
        `${this.baseUrl}/merchant/v1/payments/`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Country': this.country,
            'X-Currency': this.currency
          }
        }
      );

      const data = response.data.data || response.data;
      const status = this.mapStatus(data.transaction?.status || response.data.status?.response_code);

      return {
        success: status === TransactionStatus.PENDING || status === TransactionStatus.SUCCESS,
        provider: Provider.AIRTEL_MONEY,
        transactionId: reference,
        serverCorrelationId: data.transaction?.id || data.transaction?.airtel_money_id,
        status,
        message: response.data.status?.message || data.transaction?.message,
        rawResponse: response.data
      };
    } catch (error) {
      this.handleError(error, 'initiatePayment');
    }
  }

  /**
   * Récupère le statut d'une transaction
   */
  async getTransactionStatus(request: TransactionStatusRequest): Promise<TransactionDetails> {
    try {
      const accessToken = await this.getValidToken();

      const response = await this.httpClient.get(
        `${this.baseUrl}/standard/v1/payments/${request.transactionId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Country': this.country,
            'X-Currency': this.currency
          }
        }
      );

      const data = response.data.data || response.data;
      const transaction = data.transaction || {};

      return {
        transactionId: transaction.id || request.transactionId,
        serverCorrelationId: transaction.airtel_money_id,
        provider: Provider.AIRTEL_MONEY,
        type: TransactionType.PAYMENT,
        status: this.mapStatus(transaction.status),
        amount: parseFloat(transaction.amount) || 0,
        currency: this.currency,
        customerPhone: transaction.msisdn,
        description: transaction.message,
        reference: transaction.id,
        createdAt: transaction.created_at || new Date().toISOString(),
        rawResponse: response.data
      };
    } catch (error) {
      this.handleError(error, 'getTransactionStatus');
    }
  }

  /**
   * Décaissement (Disbursement) - Envoyer de l'argent
   */
  async disburse(recipientPhone: string, amount: number, reference?: string): Promise<PaymentResponse> {
    try {
      const accessToken = await this.getValidToken();
      const txnReference = reference || generateTransactionReference('AIRTEL-OUT');
      const phone = normalizePhone(recipientPhone);
      const phoneWithoutZero = phone.startsWith('0') ? phone.slice(1) : phone;

      const payload = {
        payee: {
          msisdn: phoneWithoutZero
        },
        reference: txnReference,
        pin: encryptWithPublicKey('', this.config.publicKey), // PIN chiffré si requis
        transaction: {
          amount: amount,
          id: txnReference
        }
      };

      const response = await this.httpClient.post(
        `${this.baseUrl}/standard/v1/disbursements/`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Country': this.country,
            'X-Currency': this.currency
          }
        }
      );

      const data = response.data.data || response.data;
      const status = this.mapStatus(data.transaction?.status);

      return {
        success: status === TransactionStatus.PENDING || status === TransactionStatus.SUCCESS,
        provider: Provider.AIRTEL_MONEY,
        transactionId: txnReference,
        serverCorrelationId: data.transaction?.id,
        status,
        message: response.data.status?.message,
        rawResponse: response.data
      };
    } catch (error) {
      this.handleError(error, 'disburse');
    }
  }

  /**
   * Mappe les statuts Airtel vers nos statuts unifiés
   */
  private mapStatus(status: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'DP00800001001': TransactionStatus.SUCCESS, // Transaction successful
      'TS': TransactionStatus.SUCCESS,
      'TIP': TransactionStatus.PENDING,
      'TF': TransactionStatus.FAILED,
      'pending': TransactionStatus.PENDING,
      'success': TransactionStatus.SUCCESS,
      'successful': TransactionStatus.SUCCESS,
      'failed': TransactionStatus.FAILED,
      'expired': TransactionStatus.EXPIRED
    };

    return statusMap[status] || statusMap[status?.toLowerCase()] || TransactionStatus.PENDING;
  }
}
