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

PaidMada intègre plusieurs couches de sécurité pour protéger votre API de paiement.

### Authentification API

Toutes les requêtes API (sauf les callbacks) nécessitent une clé API :

```bash
curl -X POST http://localhost:3000/api/pay/smart \
  -H "Content-Type: application/json" \
  -H "X-API-Key: votre_cle_api" \
  -d '{"phone": "0341234567", "amount": 10000}'
```

Configuration :
```env
API_SECRET_KEY=votre_cle_secrete_longue_et_aleatoire
```

**Caractéristiques :**
- Comparaison timing-safe (protection contre les timing attacks)
- Logging des tentatives d'accès non autorisées
- Les callbacks sont exclus (appelés par les providers externes)

### Protection CORS

```env
# En production, spécifier les origines autorisées
ALLOWED_ORIGINS=https://votresite.com,https://app.votresite.com
```

- En production : seules les origines configurées sont autorisées
- CORS bloqué si `ALLOWED_ORIGINS` non configuré en production
- Warning dans les logs si mal configuré

### Validation des Callbacks

Les callbacks des providers sont protégés par plusieurs mécanismes :

#### 1. Validation Zod
Tous les payloads sont validés avec des schémas stricts :
```typescript
// Exemple: seuls les champs attendus sont acceptés
const MVolaCallbackSchema = z.object({
  transactionReference: z.string(),
  status: z.string(),
  amount: z.union([z.string(), z.number()]),
  // ...
});
```

#### 2. Vérification de Signature HMAC (optionnel)
```env
MVOLA_CALLBACK_SECRET=votre_secret_mvola
ORANGE_CALLBACK_SECRET=votre_secret_orange
AIRTEL_CALLBACK_SECRET=votre_secret_airtel
```

Les signatures sont vérifiées avec une comparaison timing-safe.

#### 3. Whitelist d'IPs (optionnel)
```env
MVOLA_ALLOWED_IPS=197.149.xxx.xxx,197.149.xxx.xxx
ORANGE_ALLOWED_IPS=41.188.xxx.xxx
AIRTEL_ALLOWED_IPS=41.79.xxx.xxx
```

### Protection XSS

Les callbacks de redirection Orange (return/cancel) sont protégés contre les injections XSS :

- **Whitelist de champs** : seuls `order_id`, `status`, `txnid`, `amount` sont acceptés
- **Sanitization** : caractères spéciaux supprimés
- **Limite de longueur** : max 100 caractères par champ
- **Headers de sécurité** : `X-Content-Type-Options: nosniff`

```env
# Origine autorisée pour postMessage
CALLBACK_ALLOWED_ORIGIN=https://votresite.com
```

### Masquage des Données Sensibles

Les logs ne contiennent jamais de données sensibles :

```typescript
// Ces champs sont automatiquement masqués dans les logs :
// - password, secret, token, accessToken
// - consumerKey, consumerSecret, clientSecret
// - apiKey, privateKey, publicKey, pin
```

Exemple de log :
```
[mvola] Request: POST /token
{ data: { consumerKey: '***MASKED***', consumerSecret: '***MASKED***' } }
```

### Rate Limiting

Protection contre les abus :
```
- 100 requêtes par 15 minutes par IP
- Message d'erreur personnalisé en cas de dépassement
```

### Checklist Sécurité Production

```
[ ] HTTPS activé (certificat SSL)
[ ] API_SECRET_KEY configuré (clé forte, min 32 caractères)
[ ] ALLOWED_ORIGINS configuré (pas de wildcard)
[ ] CALLBACK_ALLOWED_ORIGIN configuré
[ ] Variables sensibles dans .env (jamais dans le code)
[ ] Logs en mode 'error' uniquement
[ ] Rate limiting adapté à votre trafic
[ ] IPs des providers whitelistées (si connues)
[ ] Secrets de callback configurés (si fournis par les providers)
```

### Variables d'Environnement Sécurité

```env
# === OBLIGATOIRE EN PRODUCTION ===
API_SECRET_KEY=cle_secrete_min_32_caracteres
ALLOWED_ORIGINS=https://votresite.com

# === RECOMMANDÉ ===
CALLBACK_ALLOWED_ORIGIN=https://votresite.com

# === OPTIONNEL (si fourni par les providers) ===
MVOLA_CALLBACK_SECRET=secret_mvola
ORANGE_CALLBACK_SECRET=secret_orange
AIRTEL_CALLBACK_SECRET=secret_airtel

# === OPTIONNEL (IPs des providers) ===
MVOLA_ALLOWED_IPS=ip1,ip2
ORANGE_ALLOWED_IPS=ip1,ip2
AIRTEL_ALLOWED_IPS=ip1,ip2
```

### Vulnérabilités Corrigées

| Vulnérabilité | Status | Protection |
|---------------|--------|------------|
| XSS (Cross-Site Scripting) | ✅ Corrigé | Sanitization + whitelist |
| Timing Attacks | ✅ Corrigé | Comparaison timing-safe |
| Callbacks Frauduleux | ✅ Corrigé | Zod + Signature + IP whitelist |
| Secrets dans Logs | ✅ Corrigé | Masquage automatique |
| CORS Permissif | ✅ Corrigé | Blocage si non configuré |
| Injection | ✅ Protégé | Validation Zod stricte |

## Licence

MIT
