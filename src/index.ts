/**
 * PaidMada - API de paiement mobile money unifiée pour Madagascar
 *
 * Export principal du SDK pour l'intégration dans d'autres applications
 */

// Classes principales
export { PaidMada } from './paidmada';

// Providers
export { MVolaProvider } from './providers/mvola';
export { OrangeMoneyProvider } from './providers/orange-money';
export { AirtelMoneyProvider } from './providers/airtel-money';
export { BaseProvider } from './providers/base';

// Types
export {
  // Enums
  Provider,
  TransactionStatus,
  TransactionType,

  // Configuration
  PaidMadaConfig,
  MVolaConfig,
  OrangeMoneyConfig,
  AirtelMoneyConfig,

  // Requêtes
  PaymentRequest,
  TransferRequest,
  DisbursementRequest,
  TransactionStatusRequest,

  // Réponses
  PaymentResponse,
  TransactionDetails,
  CallbackPayload,

  // Erreurs
  PaymentError,
  PaidMadaError,

  // Utilitaires
  AuthToken,
  PhoneValidation,
  PHONE_PREFIXES
} from './types';

// Utilitaires
export {
  normalizePhone,
  validatePhone,
  isPhoneForProvider,
  formatPhoneDisplay,
  toInternationalFormat
} from './utils/phone';

export {
  generateCorrelationId,
  generateTransactionReference
} from './utils/crypto';

// Validation
export {
  PaymentRequestSchema,
  StatusRequestSchema,
  SmartPayRequestSchema
} from './validation/schemas';
