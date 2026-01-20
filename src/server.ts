/**
 * Serveur Express - Point d'entrée de l'API
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import { PaidMada } from './paidmada';
import { createRoutes, errorHandler } from './api/routes';
import { logger } from './utils/logger';
import { timingSafeCompare } from './utils/crypto';

// Charger les variables d'environnement
dotenv.config();

// Configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_SANDBOX = NODE_ENV !== 'production';
const MOCK_MODE = process.env.MOCK_MODE === 'true';

// Créer l'instance PaidMada
const paidmada = new PaidMada({
  sandbox: IS_SANDBOX,
  callbackBaseUrl: process.env.CALLBACK_BASE_URL || `http://localhost:${PORT}/api/callback`,

  // Mode Mock (pour tester sans credentials)
  mockMode: MOCK_MODE ? {
    enabled: true,
    successRate: parseInt(process.env.MOCK_SUCCESS_RATE || '90'),
    responseDelay: parseInt(process.env.MOCK_RESPONSE_DELAY || '0'),
    simulatePending: process.env.MOCK_SIMULATE_PENDING !== 'false'
  } : undefined,

  // MVola (ignoré si mock mode actif)
  mvola: !MOCK_MODE && process.env.MVOLA_CONSUMER_KEY ? {
    consumerKey: process.env.MVOLA_CONSUMER_KEY,
    consumerSecret: process.env.MVOLA_CONSUMER_SECRET!,
    merchantNumber: process.env.MVOLA_MERCHANT_NUMBER!,
    partnerName: process.env.MVOLA_PARTNER_NAME!
  } : undefined,

  // Orange Money (ignoré si mock mode actif)
  orangeMoney: !MOCK_MODE && process.env.ORANGE_CLIENT_ID ? {
    clientId: process.env.ORANGE_CLIENT_ID,
    clientSecret: process.env.ORANGE_CLIENT_SECRET!,
    merchantKey: process.env.ORANGE_MERCHANT_KEY!
  } : undefined,

  // Airtel Money (ignoré si mock mode actif)
  airtelMoney: !MOCK_MODE && process.env.AIRTEL_CLIENT_ID ? {
    clientId: process.env.AIRTEL_CLIENT_ID,
    clientSecret: process.env.AIRTEL_CLIENT_SECRET!,
    publicKey: process.env.AIRTEL_PUBLIC_KEY!
  } : undefined
});

// Créer l'application Express
const app = express();

// Middlewares de sécurité
app.use(helmet());

// CORS - Plus restrictif
const corsOrigins = process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean);
app.use(cors({
  origin: NODE_ENV === 'production'
    ? (corsOrigins && corsOrigins.length > 0 ? corsOrigins : false)  // Bloquer si pas configuré en prod
    : true,  // Autoriser en dev mais logger un warning
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}));

// Warning si CORS non configuré en production
if (NODE_ENV === 'production' && (!corsOrigins || corsOrigins.length === 0)) {
  logger.warn('⚠️  ALLOWED_ORIGINS non configuré - CORS bloqué en production');
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requêtes par fenêtre
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Trop de requêtes, veuillez réessayer plus tard'
    }
  }
});
app.use('/api/', limiter);

// Parser JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger des requêtes
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Middleware d'authentification API (optionnel)
const apiKeyAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.get('X-API-Key');
  const secretKey = process.env.API_SECRET_KEY;

  // Skip si pas de clé configurée (mode dev sans auth)
  if (!secretKey) {
    if (NODE_ENV === 'production') {
      logger.warn('⚠️  API_SECRET_KEY non configuré en production!');
    }
    return next();
  }

  // Vérification avec timing-safe comparison pour éviter les timing attacks
  if (!apiKey || !timingSafeCompare(apiKey, secretKey)) {
    logger.warn('Tentative d\'accès avec clé API invalide', { ip: req.ip });
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Clé API invalide'
      }
    });
  }

  next();
};

// Routes API
app.use('/api', apiKeyAuth, createRoutes(paidmada));

// Route racine
app.get('/', (req, res) => {
  res.json({
    name: 'PaidMada',
    version: '1.0.0',
    description: 'API de paiement mobile money unifiée pour Madagascar',
    documentation: '/api/docs',
    providers: paidmada.getAvailableProviders()
  });
});

// Documentation simple
app.get('/api/docs', (req, res) => {
  res.json({
    endpoints: [
      {
        method: 'GET',
        path: '/api/health',
        description: 'Vérification de santé'
      },
      {
        method: 'GET',
        path: '/api/providers',
        description: 'Liste des providers disponibles'
      },
      {
        method: 'POST',
        path: '/api/pay',
        description: 'Initier un paiement',
        body: {
          provider: 'mvola | orange_money | airtel_money (optionnel)',
          amount: 'number (min: 100)',
          customerPhone: 'string (format: 03X XX XXX XX)',
          description: 'string (optionnel)',
          reference: 'string (optionnel)',
          metadata: 'object (optionnel)'
        }
      },
      {
        method: 'POST',
        path: '/api/pay/smart',
        description: 'Paiement avec auto-détection du provider',
        body: {
          phone: 'string',
          amount: 'number',
          description: 'string (optionnel)',
          reference: 'string (optionnel)'
        }
      },
      {
        method: 'POST',
        path: '/api/status',
        description: 'Vérifier le statut d\'une transaction',
        body: {
          provider: 'mvola | orange_money | airtel_money',
          transactionId: 'string',
          serverCorrelationId: 'string (optionnel)'
        }
      },
      {
        method: 'GET',
        path: '/api/detect/:phone',
        description: 'Détecter le provider d\'un numéro'
      }
    ]
  });
});

// Gestionnaire d'erreurs
app.use(errorHandler);

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint non trouvé'
    }
  });
});

// Démarrer le serveur
app.listen(PORT, () => {
  const modeInfo = MOCK_MODE ? 'MOCK (simulation)' : NODE_ENV;
  logger.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   PaidMada API Server                                     ║
║   Version: 1.0.0                                          ║
║   Environment: ${modeInfo.padEnd(40)}║
║   Port: ${String(PORT).padEnd(48)}║
║                                                           ║
║   Providers actifs:                                       ║
║   ${paidmada.getAvailableProviders().join(', ').padEnd(53)}║
║                                                           ║
${MOCK_MODE ? '║   ⚠️  MODE MOCK: Aucun appel réel aux providers          ║\n║                                                           ║\n' : ''}╚═══════════════════════════════════════════════════════════╝
  `);
});

export { app, paidmada };
