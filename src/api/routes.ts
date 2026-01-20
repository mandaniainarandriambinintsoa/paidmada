/**
 * Routes de l'API REST
 */

import { Router, Request, Response, NextFunction } from 'express';
import { PaidMada } from '../paidmada';
import { Provider, PaymentError } from '../types';
import {
  PaymentRequestSchema,
  StatusRequestSchema,
  SmartPayRequestSchema,
  MVolaCallbackSchema,
  OrangeCallbackSchema,
  AirtelCallbackSchema
} from '../validation/schemas';
import { logger } from '../utils/logger';
import { sanitizeCallbackData, verifyHmacSignature, maskSensitiveData } from '../utils/crypto';

// Configuration des callbacks (à définir via env)
const CALLBACK_CONFIG = {
  // Origines autorisées pour postMessage (configurer en production)
  allowedOrigin: process.env.CALLBACK_ALLOWED_ORIGIN || '*',
  // Clés de signature des providers (si disponibles)
  mvolaSignatureKey: process.env.MVOLA_CALLBACK_SECRET,
  orangeSignatureKey: process.env.ORANGE_CALLBACK_SECRET,
  airtelSignatureKey: process.env.AIRTEL_CALLBACK_SECRET,
  // Whitelist des IPs des providers (configurer en production)
  mvolaIps: process.env.MVOLA_ALLOWED_IPS?.split(',') || [],
  orangeIps: process.env.ORANGE_ALLOWED_IPS?.split(',') || [],
  airtelIps: process.env.AIRTEL_ALLOWED_IPS?.split(',') || []
};

/**
 * Vérifie si l'IP est dans la whitelist (si configurée)
 */
function isIpAllowed(clientIp: string | undefined, allowedIps: string[]): boolean {
  // Si pas de whitelist configurée, autoriser (mode dev)
  if (allowedIps.length === 0) {
    return true;
  }
  if (!clientIp) {
    return false;
  }
  // Nettoyer l'IP (IPv6 mapped IPv4)
  const cleanIp = clientIp.replace(/^::ffff:/, '');
  return allowedIps.includes(cleanIp);
}

/**
 * Vérifie la signature du callback (si configurée)
 */
function isSignatureValid(
  body: unknown,
  signature: string | undefined,
  secret: string | undefined
): boolean {
  // Si pas de clé configurée, autoriser (mode dev)
  if (!secret) {
    return true;
  }
  if (!signature) {
    return false;
  }
  try {
    return verifyHmacSignature(JSON.stringify(body), signature, secret);
  } catch {
    return false;
  }
}

export function createRoutes(paidmada: PaidMada): Router {
  const router = Router();

  // Middleware de validation
  const validate = (schema: any) => (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Données invalides',
          details: error.errors
        }
      });
    }
  };

  // ============ ENDPOINTS ============

  /**
   * GET /health - Vérification de santé
   */
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      providers: paidmada.getAvailableProviders()
    });
  });

  /**
   * GET /providers - Liste des providers disponibles
   */
  router.get('/providers', (req, res) => {
    const providers = paidmada.getAvailableProviders();
    res.json({
      success: true,
      data: {
        providers,
        details: {
          [Provider.MVOLA]: {
            name: 'MVola',
            operator: 'Telma',
            prefixes: ['034', '038'],
            available: providers.includes(Provider.MVOLA)
          },
          [Provider.ORANGE_MONEY]: {
            name: 'Orange Money',
            operator: 'Orange Madagascar',
            prefixes: ['032', '037'],
            available: providers.includes(Provider.ORANGE_MONEY)
          },
          [Provider.AIRTEL_MONEY]: {
            name: 'Airtel Money',
            operator: 'Airtel Madagascar',
            prefixes: ['033'],
            available: providers.includes(Provider.AIRTEL_MONEY)
          }
        }
      }
    });
  });

  /**
   * POST /pay - Initier un paiement
   */
  router.post('/pay', validate(PaymentRequestSchema), async (req, res, next) => {
    try {
      const result = await paidmada.pay(req.body);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /pay/smart - Paiement avec auto-détection du provider
   */
  router.post('/pay/smart', validate(SmartPayRequestSchema), async (req, res, next) => {
    try {
      const { phone, amount, description, reference, metadata } = req.body;
      const result = await paidmada.smartPay(phone, amount, {
        description,
        reference,
        metadata
      });
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /status - Vérifier le statut d'une transaction
   */
  router.post('/status', validate(StatusRequestSchema), async (req, res, next) => {
    try {
      const result = await paidmada.getStatus(req.body);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /detect/:phone - Détecter le provider d'un numéro
   */
  router.get('/detect/:phone', (req, res) => {
    const { phone } = req.params;
    const provider = paidmada.detectProvider(phone);

    if (provider) {
      res.json({
        success: true,
        data: {
          phone,
          provider,
          available: paidmada.hasProvider(provider)
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: {
          code: 'UNKNOWN_PHONE',
          message: 'Numéro non reconnu'
        }
      });
    }
  });

  // ============ CALLBACKS ============

  /**
   * POST /callback/mvola - Callback MVola
   * Sécurisé: validation Zod + vérification signature + whitelist IP
   */
  router.post('/callback/mvola', (req, res) => {
    try {
      // 1. Vérifier l'IP source (si whitelist configurée)
      if (!isIpAllowed(req.ip, CALLBACK_CONFIG.mvolaIps)) {
        logger.warn('[Callback] MVola - IP non autorisée', { ip: req.ip });
        return res.status(403).json({ error: 'Forbidden' });
      }

      // 2. Vérifier la signature (si configurée)
      const signature = req.get('X-Signature') || req.get('X-MVola-Signature');
      if (!isSignatureValid(req.body, signature, CALLBACK_CONFIG.mvolaSignatureKey)) {
        logger.warn('[Callback] MVola - Signature invalide');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // 3. Valider la structure avec Zod
      const validatedBody = MVolaCallbackSchema.parse(req.body);

      // 4. Parser le callback
      const parsed = paidmada.parseCallback(Provider.MVOLA, validatedBody);

      // 5. Logger sans données sensibles
      logger.info('[Callback] MVola', maskSensitiveData(parsed));

      res.json({ received: true });
    } catch (error) {
      logger.error('[Callback] MVola error', { error: error instanceof Error ? error.message : 'Unknown' });
      res.status(400).json({ error: 'Invalid callback' });
    }
  });

  /**
   * Callbacks Orange Money
   */
  router.post('/callback/orange/notify', (req, res) => {
    try {
      // 1. Vérifier l'IP source
      if (!isIpAllowed(req.ip, CALLBACK_CONFIG.orangeIps)) {
        logger.warn('[Callback] Orange - IP non autorisée', { ip: req.ip });
        return res.status(403).json({ error: 'Forbidden' });
      }

      // 2. Vérifier la signature
      const signature = req.get('X-Signature') || req.get('X-Orange-Signature');
      if (!isSignatureValid(req.body, signature, CALLBACK_CONFIG.orangeSignatureKey)) {
        logger.warn('[Callback] Orange - Signature invalide');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // 3. Valider la structure
      const validatedBody = OrangeCallbackSchema.parse(req.body);

      // 4. Parser le callback
      const parsed = paidmada.parseCallback(Provider.ORANGE_MONEY, validatedBody);

      // 5. Logger sans données sensibles
      logger.info('[Callback] Orange Money', maskSensitiveData(parsed));

      res.json({ received: true });
    } catch (error) {
      logger.error('[Callback] Orange error', { error: error instanceof Error ? error.message : 'Unknown' });
      res.status(400).json({ error: 'Invalid callback' });
    }
  });

  /**
   * GET /callback/orange/return - Redirection après paiement réussi
   * SÉCURISÉ: Sanitization des données pour éviter XSS
   */
  router.get('/callback/orange/return', (req, res) => {
    // Sanitize les données - whitelist des champs autorisés uniquement
    const sanitizedData = sanitizeCallbackData(
      req.query as Record<string, unknown>,
      ['order_id', 'status', 'txnid', 'amount']
    );

    // Origine pour postMessage (configurer en production!)
    const allowedOrigin = CALLBACK_CONFIG.allowedOrigin;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Paiement traité</title>
  <style>
    body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
    h1 { color: #10b981; }
  </style>
</head>
<body>
  <h1>Paiement traité</h1>
  <p>Vous pouvez fermer cette fenêtre.</p>
  <script>
    (function() {
      var data = ${JSON.stringify(sanitizedData)};
      var origin = ${JSON.stringify(allowedOrigin)};
      if (window.opener) {
        window.opener.postMessage({ type: 'payment_complete', data: data }, origin);
      }
      setTimeout(function() { window.close(); }, 3000);
    })();
  </script>
</body>
</html>`);
  });

  /**
   * GET /callback/orange/cancel - Redirection après annulation
   * SÉCURISÉ: Pas de données injectées
   */
  router.get('/callback/orange/cancel', (req, res) => {
    const allowedOrigin = CALLBACK_CONFIG.allowedOrigin;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Paiement annulé</title>
  <style>
    body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
    h1 { color: #ef4444; }
  </style>
</head>
<body>
  <h1>Paiement annulé</h1>
  <p>Vous pouvez fermer cette fenêtre.</p>
  <script>
    (function() {
      var origin = ${JSON.stringify(allowedOrigin)};
      if (window.opener) {
        window.opener.postMessage({ type: 'payment_cancelled' }, origin);
      }
      setTimeout(function() { window.close(); }, 3000);
    })();
  </script>
</body>
</html>`);
  });

  /**
   * POST /callback/airtel - Callback Airtel Money
   * Sécurisé: validation Zod + vérification signature + whitelist IP
   */
  router.post('/callback/airtel', (req, res) => {
    try {
      // 1. Vérifier l'IP source
      if (!isIpAllowed(req.ip, CALLBACK_CONFIG.airtelIps)) {
        logger.warn('[Callback] Airtel - IP non autorisée', { ip: req.ip });
        return res.status(403).json({ error: 'Forbidden' });
      }

      // 2. Vérifier la signature
      const signature = req.get('X-Signature') || req.get('X-Airtel-Signature');
      if (!isSignatureValid(req.body, signature, CALLBACK_CONFIG.airtelSignatureKey)) {
        logger.warn('[Callback] Airtel - Signature invalide');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // 3. Valider la structure
      const validatedBody = AirtelCallbackSchema.parse(req.body);

      // 4. Parser le callback
      const parsed = paidmada.parseCallback(Provider.AIRTEL_MONEY, validatedBody);

      // 5. Logger sans données sensibles
      logger.info('[Callback] Airtel Money', maskSensitiveData(parsed));

      res.json({ received: true });
    } catch (error) {
      logger.error('[Callback] Airtel error', { error: error instanceof Error ? error.message : 'Unknown' });
      res.status(400).json({ error: 'Invalid callback' });
    }
  });

  return router;
}

/**
 * Middleware de gestion des erreurs
 */
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  logger.error('API Error:', err);

  if (err instanceof PaymentError) {
    return res.status(400).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        provider: err.provider,
        details: err.details
      }
    });
  }

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Une erreur interne est survenue'
    }
  });
}
