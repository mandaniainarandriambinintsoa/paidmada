/**
 * Provider MVola (Telma)
 * Documentation: https://www.mvola.mg/devportal/
 */

import { BaseProvider } from './base';
import {
  Provider,
  MVolaConfig,
  PaymentRequest,
  PaymentResponse,
  TransactionStatusRequest,
  TransactionDetails,
  TransactionStatus,
  TransactionType,
  PaymentError
} from '../types';
import { toBase64, generateCorrelationId, generateTransactionReference } from '../utils/crypto';
import { normalizePhone } from '../utils/phone';
import { logger } from '../utils/logger';

export class MVolaProvider extends BaseProvider {
  protected provider = Provider.MVOLA;
  protected baseUrlSandbox = 'https://devapi.mvola.mg';
  protected baseUrlProduction = 'https://api.mvola.mg';

  private config: MVolaConfig;

  constructor(config: MVolaConfig) {
    super(config.sandbox ?? true);
    this.config = config;
  }

  /**
   * Authentification OAuth2
   */
  async authenticate(): Promise<void> {
    try {
      const authUrl = this.sandbox
        ? 'https://devapi.mvola.mg/token'
        : 'https://api.mvola.mg/token';

      const credentials = toBase64(`${this.config.consumerKey}:${this.config.consumerSecret}`);

      const response = await this.httpClient.post(
        authUrl,
        'grant_type=client_credentials&scope=EXT_INT_MVOLA_SCOPE',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cache-Control': 'no-cache'
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

      logger.info('[MVola] Authentication successful');
    } catch (error) {
      this.handleError(error, 'authenticate');
    }
  }

  /**
   * Initie un paiement Merchant Pay
   */
  async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const accessToken = await this.getValidToken();
      const correlationId = generateCorrelationId();
      const reference = request.reference || generateTransactionReference('MVOLA');
      const customerPhone = normalizePhone(request.customerPhone);

      const payload = {
        amount: request.amount.toString(),
        currency: request.currency || 'Ar',
        descriptionText: (request.description || 'Paiement PaidMada').slice(0, 40),
        requestingOrganisationTransactionReference: reference,
        requestDate: new Date().toISOString(),
        originalTransactionReference: reference,
        debitParty: [
          {
            key: 'msisdn',
            value: customerPhone
          }
        ],
        creditParty: [
          {
            key: 'msisdn',
            value: normalizePhone(this.config.merchantNumber)
          }
        ],
        metadata: [
          {
            key: 'partnerName',
            value: this.config.partnerName
          },
          ...(request.metadata
            ? Object.entries(request.metadata).map(([key, value]) => ({ key, value }))
            : [])
        ]
      };

      const response = await this.httpClient.post(
        `${this.baseUrl}/mvola/mm/transactions/type/merchantpay/1.0.0`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Version': '1.0',
            'X-CorrelationID': correlationId,
            'UserLanguage': 'MG',
            'UserAccountIdentifier': `msisdn;${normalizePhone(this.config.merchantNumber)}`,
            'partnerName': this.config.partnerName,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        }
      );

      const status = this.mapStatus(response.data.status);

      return {
        success: status === TransactionStatus.PENDING || status === TransactionStatus.SUCCESS,
        provider: Provider.MVOLA,
        transactionId: reference,
        serverCorrelationId: response.data.serverCorrelationId,
        status,
        message: response.data.status,
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
      const correlationId = generateCorrelationId();

      const serverCorrelationId = request.serverCorrelationId || request.transactionId;

      const response = await this.httpClient.get(
        `${this.baseUrl}/mvola/mm/transactions/type/merchantpay/1.0.0/${serverCorrelationId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Version': '1.0',
            'X-CorrelationID': correlationId,
            'UserLanguage': 'MG',
            'UserAccountIdentifier': `msisdn;${normalizePhone(this.config.merchantNumber)}`,
            'partnerName': this.config.partnerName,
            'Cache-Control': 'no-cache'
          }
        }
      );

      const data = response.data;

      return {
        transactionId: data.transactionReference || request.transactionId,
        serverCorrelationId: data.serverCorrelationId,
        provider: Provider.MVOLA,
        type: TransactionType.PAYMENT,
        status: this.mapStatus(data.transactionStatus || data.status),
        amount: parseFloat(data.amount) || 0,
        currency: data.currency || 'Ar',
        fees: data.fees ? parseFloat(data.fees) : undefined,
        customerPhone: data.debitParty?.[0]?.value,
        merchantPhone: data.creditParty?.[0]?.value,
        description: data.descriptionText,
        reference: data.requestingOrganisationTransactionReference,
        createdAt: data.creationDate || data.requestDate,
        completedAt: data.modificationDate,
        rawResponse: data
      };
    } catch (error) {
      this.handleError(error, 'getTransactionStatus');
    }
  }

  /**
   * Mappe les statuts MVola vers nos statuts unifiés
   */
  private mapStatus(status: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'pending': TransactionStatus.PENDING,
      'success': TransactionStatus.SUCCESS,
      'completed': TransactionStatus.SUCCESS,
      'failed': TransactionStatus.FAILED,
      'rejected': TransactionStatus.FAILED,
      'expired': TransactionStatus.EXPIRED,
      'cancelled': TransactionStatus.CANCELLED
    };

    return statusMap[status?.toLowerCase()] || TransactionStatus.PENDING;
  }
}
