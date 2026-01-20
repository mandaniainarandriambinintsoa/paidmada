/**
 * Exemple d'utilisation du client HTTP PaidMada
 * Utile pour les applications qui se connectent à une instance PaidMada distante
 */

import { PaidMadaClient, PaidMadaClientError } from '../src/client/paidmada-client';

async function main() {
  // Créer le client
  const client = new PaidMadaClient({
    baseUrl: 'http://localhost:3000', // URL de votre API PaidMada
    apiKey: 'votre-cle-api',          // Optionnel en dev
    timeout: 30000
  });

  // ============ Vérifier la santé ============
  const health = await client.health();
  console.log('API Status:', health);

  // ============ Lister les providers ============
  const providers = await client.getProviders();
  console.log('Providers:', providers);

  // ============ Détecter le provider d'un numéro ============
  const detection = await client.detectProvider('0341234567');
  console.log('Détection:', detection);
  // { phone: '0341234567', provider: 'mvola', available: true }

  // ============ Paiement simple ============
  try {
    const payment = await client.pay({
      provider: 'mvola',
      amount: 5000,
      customerPhone: '0343500004',
      description: 'Test paiement',
      reference: 'TEST-001'
    });

    console.log('Paiement initié:', payment);

  } catch (error) {
    if (error instanceof PaidMadaClientError) {
      console.error(`Erreur ${error.code}: ${error.message}`);
    }
  }

  // ============ Paiement intelligent ============
  try {
    const payment = await client.smartPay({
      phone: '0343500004',
      amount: 10000,
      description: 'Achat produit'
    });

    console.log('Smart Pay:', payment);

    // ============ Attendre la fin de la transaction ============
    console.log('Attente de la confirmation...');

    const final = await client.waitForCompletion({
      provider: payment.provider as 'mvola' | 'orange_money' | 'airtel_money',
      transactionId: payment.transactionId,
      serverCorrelationId: payment.serverCorrelationId
    }, {
      maxAttempts: 12,        // 12 tentatives
      intervalMs: 5000,       // Toutes les 5 secondes
      onStatusChange: (status) => {
        console.log(`Status update: ${status.status}`);
      }
    });

    console.log('Transaction finale:', final);

    if (final.status === 'success') {
      console.log('Paiement réussi !');
    } else {
      console.log('Paiement échoué:', final.status);
    }

  } catch (error) {
    if (error instanceof PaidMadaClientError) {
      if (error.code === 'TIMEOUT') {
        console.error('La transaction a pris trop de temps');
      } else {
        console.error(`Erreur: ${error.message}`);
      }
    }
  }
}

main().catch(console.error);
