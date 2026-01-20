/**
 * Classe de base pour tous les providers de paiement
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  Provider,
  AuthToken,
  PaymentRequest,
  PaymentResponse,
  TransactionStatusRequest,
  TransactionDetails,
  PaymentError
} from '../types';
import { logger } from '../utils/logger';

export abstract class BaseProvider {
  protected abstract provider: Provider;
  protected abstract baseUrlSandbox: string;
  protected abstract baseUrlProduction: string;
  protected sandbox: boolean;
  protected token: AuthToken | null = null;
  protected httpClient: AxiosInstance;

  constructor(sandbox: boolean = true) {
    this.sandbox = sandbox;
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Intercepteur pour logger les requêtes
    this.httpClient.interceptors.request.use(
      (config) => {
        logger.debug(`[${this.provider}] Request: ${config.method?.toUpperCase()} ${config.url}`, {
          headers: this.sanitizeHeaders(config.headers as Record<string, string>),
          data: config.data
        });
        return config;
      },
      (error) => {
        logger.error(`[${this.provider}] Request error:`, error);
        return Promise.reject(error);
      }
    );

    // Intercepteur pour logger les réponses
    this.httpClient.interceptors.response.use(
      (response) => {
        logger.debug(`[${this.provider}] Response: ${response.status}`, {
          data: response.data
        });
        return response;
      },
      (error: AxiosError) => {
        logger.error(`[${this.provider}] Response error: ${error.response?.status}`, {
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Retourne l'URL de base selon l'environnement
   */
  protected get baseUrl(): string {
    return this.sandbox ? this.baseUrlSandbox : this.baseUrlProduction;
  }

  /**
   * Vérifie si le token est encore valide
   */
  protected isTokenValid(): boolean {
    if (!this.token) return false;
    // Considérer expiré 60 secondes avant pour éviter les problèmes
    return Date.now() < (this.token.expiresAt - 60000);
  }

  /**
   * Obtient un token valide (génère un nouveau si nécessaire)
   */
  protected async getValidToken(): Promise<string> {
    if (!this.isTokenValid()) {
      await this.authenticate();
    }
    if (!this.token) {
      throw new PaymentError('Authentication failed', 'AUTH_FAILED', this.provider);
    }
    return this.token.accessToken;
  }

  /**
   * Sanitize headers pour le logging (masque les tokens)
   */
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized = { ...headers };
    if (sanitized.Authorization) {
      sanitized.Authorization = 'Bearer ***';
    }
    return sanitized;
  }

  /**
   * Gère les erreurs HTTP de manière uniforme
   */
  protected handleError(error: unknown, operation: string): never {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const data = axiosError.response?.data as Record<string, unknown>;

      let code = 'UNKNOWN_ERROR';
      let message = 'Une erreur inconnue est survenue';

      if (status === 401 || status === 403) {
        code = 'AUTH_ERROR';
        message = 'Erreur d\'authentification';
      } else if (status === 400) {
        code = 'VALIDATION_ERROR';
        message = 'Données invalides';
      } else if (status === 404) {
        code = 'NOT_FOUND';
        message = 'Ressource non trouvée';
      } else if (status && status >= 500) {
        code = 'SERVER_ERROR';
        message = 'Erreur serveur du provider';
      }

      throw new PaymentError(
        `[${operation}] ${message}`,
        code,
        this.provider,
        data
      );
    }

    throw new PaymentError(
      `[${operation}] ${(error as Error).message}`,
      'INTERNAL_ERROR',
      this.provider,
      error
    );
  }

  // Méthodes abstraites à implémenter par chaque provider
  abstract authenticate(): Promise<void>;
  abstract initiatePayment(request: PaymentRequest): Promise<PaymentResponse>;
  abstract getTransactionStatus(request: TransactionStatusRequest): Promise<TransactionDetails>;
}
