/**
 * PaidMada - Types et interfaces unifiés
 * Pour tous les providers de mobile money à Madagascar
 */

// ============ ENUMS ============

export enum Provider {
  MVOLA = 'mvola',
  ORANGE_MONEY = 'orange_money',
  AIRTEL_MONEY = 'airtel_money'
}

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

export enum TransactionType {
  PAYMENT = 'payment',      // Client vers Marchand
  TRANSFER = 'transfer',    // P2P
  DISBURSEMENT = 'disbursement' // Marchand vers Client
}

// ============ CONFIGURATION ============

export interface MVolaConfig {
  consumerKey: string;
  consumerSecret: string;
  merchantNumber: string;
  partnerName: string;
  sandbox?: boolean;
}

export interface OrangeMoneyConfig {
  clientId: string;
  clientSecret: string;
  merchantKey: string;
  sandbox?: boolean;
}

export interface AirtelMoneyConfig {
  clientId: string;
  clientSecret: string;
  publicKey: string;
  sandbox?: boolean;
}

export interface MockModeConfig {
  /** Active le mode mock pour tous les providers */
  enabled: boolean;
  /** Taux de succès en pourcentage (défaut: 90) */
  successRate?: number;
  /** Délai de réponse simulé en ms (0 = aléatoire 500-1500ms) */
  responseDelay?: number;
  /** Simule le statut pending avant le résultat final */
  simulatePending?: boolean;
}

export interface PaidMadaConfig {
  mvola?: MVolaConfig;
  orangeMoney?: OrangeMoneyConfig;
  airtelMoney?: AirtelMoneyConfig;
  callbackBaseUrl: string;
  sandbox?: boolean;
  /** Mode mock pour tester sans credentials */
  mockMode?: MockModeConfig;
}

// ============ REQUÊTES ============

export interface PaymentRequest {
  provider: Provider;
  amount: number;
  currency?: string; // Default: MGA
  customerPhone: string;
  description?: string;
  reference?: string;
  metadata?: Record<string, string>;
  callbackUrl?: string;
}

export interface TransferRequest {
  provider: Provider;
  amount: number;
  currency?: string;
  senderPhone: string;
  receiverPhone: string;
  description?: string;
  reference?: string;
}

export interface DisbursementRequest {
  provider: Provider;
  amount: number;
  currency?: string;
  recipientPhone: string;
  description?: string;
  reference?: string;
}

export interface TransactionStatusRequest {
  provider: Provider;
  transactionId: string;
  serverCorrelationId?: string;
}

// ============ RÉPONSES ============

export interface PaymentResponse {
  success: boolean;
  provider: Provider;
  transactionId: string;
  serverCorrelationId?: string;
  status: TransactionStatus;
  paymentUrl?: string; // Pour Orange Money (redirection web)
  message?: string;
  rawResponse?: unknown;
}

export interface TransactionDetails {
  transactionId: string;
  serverCorrelationId?: string;
  provider: Provider;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;
  fees?: number;
  customerPhone?: string;
  merchantPhone?: string;
  description?: string;
  reference?: string;
  createdAt: string;
  completedAt?: string;
  rawResponse?: unknown;
}

// ============ CALLBACKS ============

export interface CallbackPayload {
  provider: Provider;
  transactionId: string;
  serverCorrelationId?: string;
  status: TransactionStatus;
  amount: number;
  currency: string;
  customerPhone?: string;
  reference?: string;
  timestamp: string;
  rawPayload: unknown;
}

// ============ TOKENS ============

export interface AuthToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: number;
  scope?: string;
}

// ============ ERREURS ============

export interface PaidMadaError {
  code: string;
  message: string;
  provider?: Provider;
  details?: unknown;
}

export class PaymentError extends Error {
  code: string;
  provider?: Provider;
  details?: unknown;

  constructor(message: string, code: string, provider?: Provider, details?: unknown) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.provider = provider;
    this.details = details;
  }
}

// ============ UTILITAIRES ============

export interface PhoneValidation {
  isValid: boolean;
  provider?: Provider;
  normalizedNumber?: string;
  error?: string;
}

// Préfixes téléphoniques Madagascar
export const PHONE_PREFIXES = {
  [Provider.MVOLA]: ['034', '038'],
  [Provider.ORANGE_MONEY]: ['032', '037'],
  [Provider.AIRTEL_MONEY]: ['033']
} as const;
