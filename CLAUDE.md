# PaidMada - Context pour Claude

## Vue d'ensemble du projet

PaidMada est une API de paiement mobile money unifiée pour Madagascar. Elle centralise trois providers:

1. **MVola** (Telma) - Préfixes: 034, 038
2. **Orange Money** - Préfixes: 032, 037
3. **Airtel Money** - Préfixes: 033

## Architecture

```
src/
├── types/index.ts        # Types et interfaces
├── providers/
│   ├── base.ts           # Classe abstraite BaseProvider
│   ├── mvola.ts          # Implémentation MVola
│   ├── orange-money.ts   # Implémentation Orange Money
│   └── airtel-money.ts   # Implémentation Airtel Money
├── utils/
│   ├── phone.ts          # Validation/normalisation téléphone
│   ├── crypto.ts         # Utilitaires cryptographiques
│   └── logger.ts         # Configuration Winston
├── validation/
│   └── schemas.ts        # Schémas Zod
├── api/
│   └── routes.ts         # Routes Express
├── client/
│   └── paidmada-client.ts # SDK Client HTTP
├── paidmada.ts           # Classe principale PaidMada
├── server.ts             # Serveur Express
└── index.ts              # Exports SDK
```

## APIs des providers

### MVola
- **Auth**: OAuth 2.0, endpoint `/token`
- **Base URL Sandbox**: `https://devapi.mvola.mg`
- **Base URL Prod**: `https://api.mvola.mg`
- **Endpoint paiement**: `POST /mvola/mm/transactions/type/merchantpay/1.0.0`
- **Headers requis**: Authorization, Version, X-CorrelationID, UserLanguage, UserAccountIdentifier, partnerName
- **Numéros test**: 0343500003, 0343500004

### Orange Money
- **Auth**: OAuth 2.0, endpoint `https://api.orange.com/oauth/v3/token`
- **Base URL Sandbox**: `https://api.orange.com/orange-money-webpay/dev/v1`
- **Base URL Prod**: `https://api.orange.com/orange-money-webpay/mg/v1`
- **Endpoint paiement**: `POST /webpayment` (retourne URL de redirection)
- **Statuts**: INITIATED, PENDING, SUCCESS, FAILED, EXPIRED

### Airtel Money
- **Auth**: OAuth 2.0, endpoint `/auth/oauth2/token`
- **Base URL Sandbox**: `https://openapiuat.airtel.africa`
- **Base URL Prod**: `https://openapi.airtel.africa`
- **Endpoint paiement**: `POST /merchant/v1/payments/`
- **Headers requis**: Authorization, X-Country (MG), X-Currency (MGA)
- **Format phone**: Sans le 0 initial (33XXXXXXX)

## Flux de paiement

1. Client appelle `POST /api/pay` ou `POST /api/pay/smart`
2. Le numéro est validé et normalisé
3. Le provider est détecté (ou spécifié)
4. Authentification OAuth2 avec le provider
5. Initiation de la transaction
6. Retour du statut (pending généralement)
7. Le provider envoie un callback quand finalisé
8. Ou le client poll `/api/status`

## Variables d'environnement

```
NODE_ENV=development
PORT=3000
MVOLA_CONSUMER_KEY=
MVOLA_CONSUMER_SECRET=
MVOLA_MERCHANT_NUMBER=
MVOLA_PARTNER_NAME=
ORANGE_CLIENT_ID=
ORANGE_CLIENT_SECRET=
ORANGE_MERCHANT_KEY=
AIRTEL_CLIENT_ID=
AIRTEL_CLIENT_SECRET=
AIRTEL_PUBLIC_KEY=
CALLBACK_BASE_URL=
API_SECRET_KEY=
```

## Commandes utiles

```bash
npm run dev    # Développement avec hot-reload
npm run build  # Compilation TypeScript
npm start      # Production
npm test       # Tests
```

## Points d'attention

- Les tokens OAuth expirent (généralement 1h pour MVola, 90j pour Orange)
- MVola: description max 40 caractères, pas de caractères spéciaux
- Orange Money: nécessite redirection web pour confirmation OTP
- Airtel: numéros sans le préfixe 0
- Toujours valider les callbacks (IP, signature si disponible)
