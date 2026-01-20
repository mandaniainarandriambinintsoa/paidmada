/**
 * Routes de l'API REST
 */

import { Router, Request, Response, NextFunction } from 'express';
import { PaidMada } from '../paidmada';
import { Provider, PaymentError } from '../types';
import {
  PaymentRequestSchema,
  StatusRequestSchema,
  SmartPayRequestSchema
} from '../validation/schemas';
import { logger } from '../utils/logger';

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
   */
  router.post('/callback/mvola', (req, res) => {
    try {
      const parsed = paidmada.parseCallback(Provider.MVOLA, req.body);
      logger.info('[Callback] MVola', parsed);
      // Ici, émettre un événement ou sauvegarder en BDD
      res.json({ received: true });
    } catch (error) {
      logger.error('[Callback] MVola error', error);
      res.status(400).json({ error: 'Invalid callback' });
    }
  });

  /**
   * Callbacks Orange Money
   */
  router.post('/callback/orange/notify', (req, res) => {
    try {
      const parsed = paidmada.parseCallback(Provider.ORANGE_MONEY, req.body);
      logger.info('[Callback] Orange Money', parsed);
      res.json({ received: true });
    } catch (error) {
      logger.error('[Callback] Orange error', error);
      res.status(400).json({ error: 'Invalid callback' });
    }
  });

  router.get('/callback/orange/return', (req, res) => {
    // Redirection après paiement réussi
    res.send(`
      <html>
        <body>
          <h1>Paiement traité</h1>
          <p>Vous pouvez fermer cette fenêtre.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'payment_complete', data: ${JSON.stringify(req.query)} }, '*');
            }
          </script>
        </body>
      </html>
    `);
  });

  router.get('/callback/orange/cancel', (req, res) => {
    res.send(`
      <html>
        <body>
          <h1>Paiement annulé</h1>
          <p>Vous pouvez fermer cette fenêtre.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'payment_cancelled' }, '*');
            }
          </script>
        </body>
      </html>
    `);
  });

  /**
   * POST /callback/airtel - Callback Airtel Money
   */
  router.post('/callback/airtel', (req, res) => {
    try {
      const parsed = paidmada.parseCallback(Provider.AIRTEL_MONEY, req.body);
      logger.info('[Callback] Airtel Money', parsed);
      res.json({ received: true });
    } catch (error) {
      logger.error('[Callback] Airtel error', error);
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
