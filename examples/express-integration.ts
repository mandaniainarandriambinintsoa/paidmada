/**
 * Exemple d'intégration dans une application Express existante
 */

import express from 'express';
import { PaidMada, Provider, PaymentError } from '../src';

const app = express();
app.use(express.json());

// Initialiser PaidMada
const paidmada = new PaidMada({
  sandbox: process.env.NODE_ENV !== 'production',
  callbackBaseUrl: process.env.CALLBACK_URL || 'http://localhost:3000',
  mvola: {
    consumerKey: process.env.MVOLA_KEY!,
    consumerSecret: process.env.MVOLA_SECRET!,
    merchantNumber: process.env.MVOLA_MERCHANT!,
    partnerName: process.env.MVOLA_PARTNER!
  }
});

// Route pour initier un paiement
app.post('/checkout', async (req, res) => {
  try {
    const { phone, amount, orderId } = req.body;

    // Créer le paiement
    const payment = await paidmada.smartPay(phone, amount, {
      description: `Commande ${orderId}`,
      reference: orderId
    });

    // Sauvegarder en BDD
    // await db.orders.update({ id: orderId }, { paymentId: payment.transactionId });

    res.json({
      success: true,
      paymentId: payment.transactionId,
      status: payment.status,
      // Pour Orange Money, rediriger vers cette URL
      redirectUrl: payment.paymentUrl
    });

  } catch (error) {
    if (error instanceof PaymentError) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: error.code
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Erreur interne'
      });
    }
  }
});

// Route pour vérifier le statut
app.get('/payment/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { provider } = req.query;

    const status = await paidmada.getStatus({
      provider: provider as Provider || Provider.MVOLA,
      transactionId: id
    });

    res.json({
      success: true,
      status: status.status,
      details: status
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Webhook callback MVola
app.post('/webhooks/mvola', (req, res) => {
  const callback = paidmada.parseCallback(Provider.MVOLA, req.body);

  console.log('MVola callback:', callback);

  // Mettre à jour la commande en BDD
  // await db.orders.update(
  //   { paymentId: callback.transactionId },
  //   { status: callback.status === 'success' ? 'paid' : 'failed' }
  // );

  res.json({ received: true });
});

// Webhook callback Orange Money
app.post('/webhooks/orange', (req, res) => {
  const callback = paidmada.parseCallback(Provider.ORANGE_MONEY, req.body);
  console.log('Orange callback:', callback);
  res.json({ received: true });
});

// Webhook callback Airtel
app.post('/webhooks/airtel', (req, res) => {
  const callback = paidmada.parseCallback(Provider.AIRTEL_MONEY, req.body);
  console.log('Airtel callback:', callback);
  res.json({ received: true });
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
