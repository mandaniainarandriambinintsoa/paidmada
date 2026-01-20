/**
 * Schémas de validation Zod
 */

import { z } from 'zod';
import { Provider } from '../types';

// Enum des providers
export const ProviderSchema = z.enum([
  Provider.MVOLA,
  Provider.ORANGE_MONEY,
  Provider.AIRTEL_MONEY
]);

// Validation du numéro de téléphone malgache
export const PhoneSchema = z.string()
  .transform(val => val.replace(/\D/g, ''))
  .refine(val => {
    // Normaliser
    let phone = val;
    if (phone.startsWith('261') && phone.length === 12) {
      phone = '0' + phone.slice(3);
    }
    if (phone.length === 9 && !phone.startsWith('0')) {
      phone = '0' + phone;
    }
    return phone.length === 10 && phone.startsWith('03');
  }, {
    message: 'Numéro de téléphone malgache invalide (format: 03X XX XXX XX)'
  });

// Requête de paiement
export const PaymentRequestSchema = z.object({
  provider: ProviderSchema.optional(),
  amount: z.number().positive('Le montant doit être positif').min(100, 'Montant minimum: 100 Ar'),
  currency: z.string().default('MGA'),
  customerPhone: PhoneSchema,
  description: z.string().max(100).optional(),
  reference: z.string().max(50).optional(),
  metadata: z.record(z.string()).optional(),
  callbackUrl: z.string().url().optional()
});

// Requête de statut
export const StatusRequestSchema = z.object({
  provider: ProviderSchema,
  transactionId: z.string().min(1),
  serverCorrelationId: z.string().optional()
});

// Paiement intelligent (auto-detect provider)
export const SmartPayRequestSchema = z.object({
  phone: PhoneSchema,
  amount: z.number().positive().min(100),
  description: z.string().max(100).optional(),
  reference: z.string().max(50).optional(),
  metadata: z.record(z.string()).optional()
});

// ============ CALLBACKS SCHEMAS ============

// Callback MVola
export const MVolaCallbackSchema = z.object({
  transactionReference: z.string().optional(),
  serverCorrelationId: z.string().optional(),
  status: z.string().optional(),
  transactionStatus: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  debitParty: z.array(z.object({
    key: z.string().optional(),
    value: z.string().optional()
  })).optional(),
  creditParty: z.array(z.object({
    key: z.string().optional(),
    value: z.string().optional()
  })).optional(),
  originalTransactionReference: z.string().optional()
}).passthrough();

// Callback Orange Money
export const OrangeCallbackSchema = z.object({
  order_id: z.string().optional(),
  txnid: z.string().optional(),
  status: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  message: z.string().optional()
}).passthrough();

// Callback Airtel Money
export const AirtelCallbackSchema = z.object({
  transaction: z.object({
    id: z.string().optional(),
    airtel_money_id: z.string().optional(),
    status: z.string().optional(),
    amount: z.union([z.string(), z.number()]).optional(),
    msisdn: z.string().optional()
  }).optional()
}).passthrough();

// Metadata avec limites de sécurité
export const SecureMetadataSchema = z.record(
  z.string().max(64, 'Clé metadata trop longue'),
  z.string().max(256, 'Valeur metadata trop longue')
).refine(
  obj => Object.keys(obj).length <= 10,
  'Maximum 10 champs metadata autorisés'
).optional();

// Types inférés
export type PaymentRequestInput = z.infer<typeof PaymentRequestSchema>;
export type StatusRequestInput = z.infer<typeof StatusRequestSchema>;
export type SmartPayRequestInput = z.infer<typeof SmartPayRequestSchema>;
export type MVolaCallbackInput = z.infer<typeof MVolaCallbackSchema>;
export type OrangeCallbackInput = z.infer<typeof OrangeCallbackSchema>;
export type AirtelCallbackInput = z.infer<typeof AirtelCallbackSchema>;
