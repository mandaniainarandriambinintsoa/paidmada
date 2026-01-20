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

// Types inférés
export type PaymentRequestInput = z.infer<typeof PaymentRequestSchema>;
export type StatusRequestInput = z.infer<typeof StatusRequestSchema>;
export type SmartPayRequestInput = z.infer<typeof SmartPayRequestSchema>;
