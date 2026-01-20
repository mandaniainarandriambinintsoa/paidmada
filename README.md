# PaidMada

**API de paiement mobile money unifiée pour Madagascar**

Centralisez les paiements MVola (Telma), Orange Money et Airtel Money en une seule API.

## Fonctionnalités

- **API REST unifiée** - Une seule interface pour tous les providers
- **Auto-détection** - Détecte automatiquement le provider depuis le numéro de téléphone
- **SDK TypeScript** - Types complets et autocomplétion
- **Sécurisé** - HTTPS, rate limiting, validation des entrées
- **Callbacks** - Webhooks pour les notifications de paiement

## Installation

```bash
npm install
npm run build
```

## Configuration

Copier `.env.example` vers `.env` et configurer les credentials:

```env
# Environnement
NODE_ENV=development
PORT=3000

# MVola (Telma)
MVOLA_CONSUMER_KEY=votre_consumer_key
MVOLA_CONSUMER_SECRET=votre_consumer_secret
MVOLA_MERCHANT_NUMBER=0343500003
MVOLA_PARTNER_NAME=VotreEntreprise

# Orange Money
ORANGE_CLIENT_ID=votre_client_id
ORANGE_CLIENT_SECRET=votre_client_secret
ORANGE_MERCHANT_KEY=votre_merchant_key

# Airtel Money
AIRTEL_CLIENT_ID=votre_client_id
AIRTEL_CLIENT_SECRET=votre_client_secret
AIRTEL_PUBLIC_KEY=votre_public_key

# URL de callback (votre serveur public)
CALLBACK_BASE_URL=https://votre-domaine.com/api/callback

# Sécurité API
API_SECRET_KEY=une_cle_secrete_longue
```

## Démarrage

```bash
# Développement
npm run dev

# Production
npm run build
npm start
```

## Endpoints API

### Santé
```
GET /api/health
```

### Providers disponibles
```
GET /api/providers
```

### Initier un paiement
```
POST /api/pay
Content-Type: application/json

{
  "provider": "mvola",           // optionnel (auto-détecté)
  "amount": 10000,               // montant en Ariary
  "customerPhone": "0341234567", // numéro client
  "description": "Achat produit",
  "reference": "CMD-001"
}
```

### Paiement intelligent (auto-détection)
```
POST /api/pay/smart
Content-Type: application/json

{
  "phone": "0341234567",
  "amount": 10000,
  "description": "Achat produit"
}
```

### Vérifier statut
```
POST /api/status
Content-Type: application/json

{
  "provider": "mvola",
  "transactionId": "TXN-ABC123",
  "serverCorrelationId": "..."
}
```

### Détecter provider
```
GET /api/detect/0341234567
```

## Préfixes téléphoniques

| Provider | Préfixes |
|----------|----------|
| MVola | 034, 038 |
| Orange Money | 032, 037 |
| Airtel Money | 033 |

## Intégration SDK

### Utilisation comme serveur (API REST)

```bash
npm start
# L'API est disponible sur http://localhost:3000
```

### Utilisation comme librairie (SDK)

```typescript
import { PaidMada, Provider } from 'paidmada';

const paidmada = new PaidMada({
  sandbox: true,
  callbackBaseUrl: 'https://mon-serveur.com/callback',
  mvola: {
    consumerKey: '...',
    consumerSecret: '...',
    merchantNumber: '0343500003',
    partnerName: 'MonEntreprise'
  },
  orangeMoney: {
    clientId: '...',
    clientSecret: '...',
    merchantKey: '...'
  },
  airtelMoney: {
    clientId: '...',
    clientSecret: '...',
    publicKey: '...'
  }
});

// Paiement avec auto-détection
const result = await paidmada.smartPay('0341234567', 10000, {
  description: 'Commande #123'
});

console.log(result);
// {
//   success: true,
//   provider: 'mvola',
//   transactionId: 'TXN-...',
//   status: 'pending'
// }

// Vérifier le statut
const details = await paidmada.getStatus({
  provider: Provider.MVOLA,
  transactionId: result.transactionId
});
```

### Client HTTP

```typescript
import { PaidMadaClient } from 'paidmada/client/paidmada-client';

const client = new PaidMadaClient({
  baseUrl: 'https://votre-api.com',
  apiKey: 'votre-cle-api'
});

// Paiement
const payment = await client.smartPay({
  phone: '0341234567',
  amount: 10000,
  description: 'Achat'
});

// Attendre la fin du paiement
const result = await client.waitForCompletion({
  provider: payment.provider,
  transactionId: payment.transactionId
}, {
  maxAttempts: 30,
  intervalMs: 5000,
  onStatusChange: (status) => console.log('Status:', status.status)
});
```

## Callbacks (Webhooks)

Configurez votre `CALLBACK_BASE_URL` pour recevoir les notifications:

| Provider | Endpoint |
|----------|----------|
| MVola | POST `/api/callback/mvola` |
| Orange Money | POST `/api/callback/orange/notify` |
| Airtel Money | POST `/api/callback/airtel` |

Exemple de payload callback:
```json
{
  "provider": "mvola",
  "transactionId": "TXN-ABC123",
  "status": "success",
  "amount": 10000,
  "currency": "MGA",
  "customerPhone": "0341234567",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Mode Mock (Tests sans credentials)

Le mode mock permet de tester l'API sans avoir de credentials réels. Tous les appels sont simulés localement.

### Activer le mode mock

Dans votre `.env` :
```env
MOCK_MODE=true
MOCK_SUCCESS_RATE=90          # Taux de succès (0-100), défaut: 90
MOCK_RESPONSE_DELAY=0         # Délai en ms (0 = aléatoire 500-1500ms)
MOCK_SIMULATE_PENDING=true    # Simule d'abord "pending" puis le résultat final
```

### Via le SDK

```typescript
const paidmada = new PaidMada({
  callbackBaseUrl: 'http://localhost:3000/api/callback',
  mockMode: {
    enabled: true,
    successRate: 90,        // 90% de succès
    responseDelay: 1000,    // 1 seconde de délai
    simulatePending: true   // Statut pending avant résultat final
  }
});

// Utilisation normale - les appels sont simulés
const result = await paidmada.smartPay('0341234567', 10000);
console.log(result);
// {
//   success: true,
//   provider: 'mvola',
//   transactionId: 'MOCK-xxx',
//   status: 'pending'
// }
```

### Comportement du mock

1. **Tous les providers sont disponibles** - MVola, Orange Money, Airtel Money
2. **Les transactions sont stockées en mémoire** - Vous pouvez vérifier le statut
3. **Le statut évolue automatiquement** - De `pending` vers `success` ou `failed` après 3 secondes
4. **Taux de succès configurable** - Par défaut 90% de succès

## Sandbox / Test

En mode sandbox (`NODE_ENV=development`), utilisez les numéros de test:

**MVola:**
- 0343500003
- 0343500004

**Orange Money:**
- Utilisez l'environnement sandbox Orange Developer

**Airtel Money:**
- Utilisez l'environnement UAT Airtel

## Obtenir les credentials

### MVola
1. Créer un compte sur [developer.mvola.mg](https://developer.mvola.mg)
2. Créer une application
3. Récupérer Consumer Key et Consumer Secret

### Orange Money
1. Créer un compte sur [developer.orange.com](https://developer.orange.com)
2. S'abonner à l'API "Orange Money Web Payment"
3. Récupérer les credentials

### Airtel Money
1. Créer un compte sur [developers.airtel.africa](https://developers.airtel.africa)
2. Créer une application
3. Soumettre les documents KYC pour la production

## Structure du projet

```
PaidMada/
├── src/
│   ├── api/           # Routes Express
│   ├── client/        # SDK Client HTTP
│   ├── providers/     # Implémentations MVola, Orange, Airtel
│   ├── types/         # Types TypeScript
│   ├── utils/         # Utilitaires
│   ├── validation/    # Schémas Zod
│   ├── paidmada.ts    # Classe principale
│   ├── server.ts      # Serveur Express
│   └── index.ts       # Export SDK
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Sécurité

- Toujours utiliser HTTPS en production
- Configurer `API_SECRET_KEY` pour protéger l'API
- Ne jamais exposer les credentials dans le code
- Valider les callbacks avec les signatures fournies par les providers

## Licence

MIT
