/**
 * Exemple d'utilisation basique de PaidMada
 */

import { PaidMada, Provider } from '../src';

async function main() {
  // Initialiser PaidMada avec les credentials
  const paidmada = new PaidMada({
    sandbox: true, // Mode test
    callbackBaseUrl: 'https://mon-site.com/api/callback',

    // Configuration MVola (Telma)
    mvola: {
      consumerKey: 'VOTRE_CONSUMER_KEY',
      consumerSecret: 'VOTRE_CONSUMER_SECRET',
      merchantNumber: '0343500003',
      partnerName: 'MonEntreprise'
    },

    // Configuration Orange Money (optionnel)
    orangeMoney: {
      clientId: 'VOTRE_CLIENT_ID',
      clientSecret: 'VOTRE_CLIENT_SECRET',
      merchantKey: 'VOTRE_MERCHANT_KEY'
    },

    // Configuration Airtel Money (optionnel)
    airtelMoney: {
      clientId: 'VOTRE_CLIENT_ID',
      clientSecret: 'VOTRE_CLIENT_SECRET',
      publicKey: 'VOTRE_PUBLIC_KEY'
    }
  });

  console.log('Providers disponibles:', paidmada.getAvailableProviders());

  // ============ Exemple 1: Paiement avec provider spécifié ============
  try {
    const result = await paidmada.pay({
      provider: Provider.MVOLA,
      amount: 5000, // 5000 Ar
      customerPhone: '0343500004', // Numéro test MVola
      description: 'Commande #123',
      reference: 'CMD-2024-001'
    });

    console.log('Paiement initié:', result);
    // {
    //   success: true,
    //   provider: 'mvola',
    //   transactionId: 'MVOLA-...',
    //   serverCorrelationId: '...',
    //   status: 'pending',
    //   message: 'Transaction initiated'
    // }

    // Vérifier le statut après quelques secondes
    setTimeout(async () => {
      const status = await paidmada.getStatus({
        provider: Provider.MVOLA,
        transactionId: result.transactionId,
        serverCorrelationId: result.serverCorrelationId
      });
      console.log('Statut:', status);
    }, 10000);

  } catch (error) {
    console.error('Erreur paiement:', error);
  }

  // ============ Exemple 2: Paiement intelligent (auto-détection) ============
  try {
    // Le provider est détecté automatiquement depuis le numéro
    const result = await paidmada.smartPay(
      '0321234567', // Numéro Orange Money (032)
      10000,        // Montant
      {
        description: 'Abonnement mensuel',
        reference: 'ABO-001'
      }
    );

    console.log('Smart pay result:', result);
    // Pour Orange Money, result.paymentUrl contient l'URL de redirection
    if (result.paymentUrl) {
      console.log('Rediriger le client vers:', result.paymentUrl);
    }

  } catch (error) {
    console.error('Erreur smart pay:', error);
  }

  // ============ Exemple 3: Détecter le provider ============
  const phoneNumbers = ['0341234567', '0321234567', '0331234567'];

  for (const phone of phoneNumbers) {
    const provider = paidmada.detectProvider(phone);
    console.log(`${phone} → ${provider || 'Inconnu'}`);
  }
  // 0341234567 → mvola
  // 0321234567 → orange_money
  // 0331234567 → airtel_money
}

main().catch(console.error);
