/**
 * PaidMada Client SDK
 * Client HTTP pour intégrer PaidMada dans n'importe quelle application
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// Types
export interface PaymentRequest {
  provider?: 'mvola' | 'orange_money' | 'airtel_money';
  amount: number;
  customerPhone: string;
  description?: string;
  reference?: string;
  metadata?: Record<string, string>;
}

export interface SmartPayRequest {
  phone: string;
  amount: number;
  description?: string;
  reference?: string;
  metadata?: Record<string, string>;
}

export interface StatusRequest {
  provider: 'mvola' | 'orange_money' | 'airtel_money';
  transactionId: string;
  serverCorrelationId?: string;
}

export interface PaymentResponse {
  success: boolean;
  provider: string;
  transactionId: string;
  serverCorrelationId?: string;
  status: 'pending' | 'success' | 'failed' | 'expired' | 'cancelled';
  paymentUrl?: string;
  message?: string;
}

export interface TransactionDetails {
  transactionId: string;
  serverCorrelationId?: string;
  provider: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  fees?: number;
  customerPhone?: string;
  merchantPhone?: string;
  description?: string;
  reference?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ProviderInfo {
  name: string;
  operator: string;
  prefixes: string[];
  available: boolean;
}

export interface PaidMadaClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export class PaidMadaClientError extends Error {
  code: string;
  details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'PaidMadaClientError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Client PaidMada pour intégration facile
 */
export class PaidMadaClient {
  private http: AxiosInstance;

  constructor(config: PaidMadaClientConfig) {
    this.http = axios.create({
      baseURL: config.baseUrl.replace(/\/$/, '') + '/api',
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'X-API-Key': config.apiKey })
      }
    });

    // Intercepteur d'erreurs
    this.http.interceptors.response.use(
      response => response,
      (error: AxiosError) => {
        const data = error.response?.data as { error?: { code: string; message: string; details?: unknown } };
        if (data?.error) {
          throw new PaidMadaClientError(
            data.error.message,
            data.error.code,
            data.error.details
          );
        }
        throw new PaidMadaClientError(
          error.message || 'Erreur de connexion',
          'NETWORK_ERROR'
        );
      }
    );
  }

  /**
   * Vérifie la santé de l'API
   */
  async health(): Promise<{ status: string; providers: string[] }> {
    const { data } = await this.http.get('/health');
    return data;
  }

  /**
   * Liste les providers disponibles
   */
  async getProviders(): Promise<Record<string, ProviderInfo>> {
    const { data } = await this.http.get('/providers');
    return data.data.details;
  }

  /**
   * Initie un paiement
   */
  async pay(request: PaymentRequest): Promise<PaymentResponse> {
    const { data } = await this.http.post('/pay', request);
    return data.data;
  }

  /**
   * Paiement intelligent avec auto-détection du provider
   */
  async smartPay(request: SmartPayRequest): Promise<PaymentResponse> {
    const { data } = await this.http.post('/pay/smart', request);
    return data.data;
  }

  /**
   * Vérifie le statut d'une transaction
   */
  async getStatus(request: StatusRequest): Promise<TransactionDetails> {
    const { data } = await this.http.post('/status', request);
    return data.data;
  }

  /**
   * Détecte le provider d'un numéro de téléphone
   */
  async detectProvider(phone: string): Promise<{ phone: string; provider: string; available: boolean }> {
    const { data } = await this.http.get(`/detect/${encodeURIComponent(phone)}`);
    return data.data;
  }

  /**
   * Polling pour attendre la fin d'une transaction
   */
  async waitForCompletion(
    request: StatusRequest,
    options?: {
      maxAttempts?: number;
      intervalMs?: number;
      onStatusChange?: (status: TransactionDetails) => void;
    }
  ): Promise<TransactionDetails> {
    const maxAttempts = options?.maxAttempts || 30;
    const intervalMs = options?.intervalMs || 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const details = await this.getStatus(request);

      if (options?.onStatusChange) {
        options.onStatusChange(details);
      }

      if (details.status === 'success' || details.status === 'failed' || details.status === 'expired' || details.status === 'cancelled') {
        return details;
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new PaidMadaClientError(
      'Timeout en attente de la transaction',
      'TIMEOUT'
    );
  }
}

// Export par défaut
export default PaidMadaClient;
