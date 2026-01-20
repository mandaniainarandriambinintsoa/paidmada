/**
 * Tests pour les routes API
 */

import express from 'express';
import request from 'supertest';
import { PaidMada } from '../src/paidmada';
import { createRoutes, errorHandler } from '../src/api/routes';
import { Provider } from '../src/types';

describe('API Routes', () => {
  let app: express.Application;
  let paidmada: PaidMada;

  beforeAll(() => {
    // Create PaidMada instance in mock mode
    paidmada = new PaidMada({
      callbackBaseUrl: 'http://localhost:3000/api/callback',
      mockMode: {
        enabled: true,
        successRate: 100,
        responseDelay: 0,
        simulatePending: false
      }
    });

    // Create Express app
    app = express();
    app.use(express.json());
    app.use('/api', createRoutes(paidmada));
    app.use(errorHandler);
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.providers).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/providers', () => {
    it('should return available providers', async () => {
      const response = await request(app)
        .get('/api/providers')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.providers).toContain(Provider.MVOLA);
      expect(response.body.data.providers).toContain(Provider.ORANGE_MONEY);
      expect(response.body.data.providers).toContain(Provider.AIRTEL_MONEY);
      expect(response.body.data.details).toBeDefined();
    });

    it('should include provider details', async () => {
      const response = await request(app)
        .get('/api/providers')
        .expect(200);

      const mvolaDetails = response.body.data.details[Provider.MVOLA];
      expect(mvolaDetails.name).toBe('MVola');
      expect(mvolaDetails.operator).toBe('Telma');
      expect(mvolaDetails.prefixes).toContain('034');
    });
  });

  describe('GET /api/detect/:phone', () => {
    it('should detect MVola provider', async () => {
      const response = await request(app)
        .get('/api/detect/0341234567')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.provider).toBe(Provider.MVOLA);
    });

    it('should detect Orange Money provider', async () => {
      const response = await request(app)
        .get('/api/detect/0321234567')
        .expect(200);

      expect(response.body.data.provider).toBe(Provider.ORANGE_MONEY);
    });

    it('should detect Airtel Money provider', async () => {
      const response = await request(app)
        .get('/api/detect/0331234567')
        .expect(200);

      expect(response.body.data.provider).toBe(Provider.AIRTEL_MONEY);
    });

    it('should return error for unknown number', async () => {
      const response = await request(app)
        .get('/api/detect/0441234567')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNKNOWN_PHONE');
    });
  });

  describe('POST /api/pay', () => {
    it('should process payment request', async () => {
      const response = await request(app)
        .post('/api/pay')
        .send({
          provider: Provider.MVOLA,
          amount: 10000,
          customerPhone: '0341234567',
          description: 'Test payment'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.provider).toBe(Provider.MVOLA);
      expect(response.body.data.transactionId).toBeDefined();
    });

    it('should reject invalid amount', async () => {
      const response = await request(app)
        .post('/api/pay')
        .send({
          provider: Provider.MVOLA,
          amount: 50, // Below minimum
          customerPhone: '0341234567'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid phone', async () => {
      const response = await request(app)
        .post('/api/pay')
        .send({
          provider: Provider.MVOLA,
          amount: 10000,
          customerPhone: 'invalid'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/pay/smart', () => {
    it('should process smart payment with auto-detection', async () => {
      const response = await request(app)
        .post('/api/pay/smart')
        .send({
          phone: '0341234567',
          amount: 10000,
          description: 'Smart test'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.provider).toBe(Provider.MVOLA);
    });

    it('should work with different providers', async () => {
      const orangeResponse = await request(app)
        .post('/api/pay/smart')
        .send({ phone: '0321234567', amount: 5000 })
        .expect(200);

      expect(orangeResponse.body.data.provider).toBe(Provider.ORANGE_MONEY);

      const airtelResponse = await request(app)
        .post('/api/pay/smart')
        .send({ phone: '0331234567', amount: 7000 })
        .expect(200);

      expect(airtelResponse.body.data.provider).toBe(Provider.AIRTEL_MONEY);
    });
  });

  describe('POST /api/status', () => {
    it('should return transaction status', async () => {
      // First create a payment
      const paymentResponse = await request(app)
        .post('/api/pay/smart')
        .send({ phone: '0341234567', amount: 10000 });

      const transactionId = paymentResponse.body.data.transactionId;

      // Then check status
      const statusResponse = await request(app)
        .post('/api/status')
        .send({
          provider: Provider.MVOLA,
          transactionId
        })
        .expect(200);

      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.data.transactionId).toBe(transactionId);
    });
  });

  describe('Callbacks', () => {
    describe('POST /api/callback/mvola', () => {
      it('should accept MVola callback', async () => {
        const response = await request(app)
          .post('/api/callback/mvola')
          .send({
            transactionReference: 'TXN-123',
            status: 'success',
            amount: '10000'
          })
          .expect(200);

        expect(response.body.received).toBe(true);
      });
    });

    describe('POST /api/callback/orange/notify', () => {
      it('should accept Orange callback', async () => {
        const response = await request(app)
          .post('/api/callback/orange/notify')
          .send({
            order_id: 'ORD-123',
            status: 'SUCCESS',
            amount: 5000
          })
          .expect(200);

        expect(response.body.received).toBe(true);
      });
    });

    describe('GET /api/callback/orange/return', () => {
      it('should return HTML page', async () => {
        const response = await request(app)
          .get('/api/callback/orange/return')
          .query({ order_id: 'ORD-123', status: 'SUCCESS' })
          .expect(200);

        expect(response.headers['content-type']).toContain('text/html');
        expect(response.text).toContain('Paiement traité');
      });

      it('should sanitize XSS attempts', async () => {
        const response = await request(app)
          .get('/api/callback/orange/return')
          .query({
            order_id: 'ORD-123',
            malicious: '<script>alert(1)</script>'
          })
          .expect(200);

        // malicious field should not be in the response
        expect(response.text).not.toContain('malicious');
        expect(response.text).not.toContain('<script>alert');
      });
    });

    describe('GET /api/callback/orange/cancel', () => {
      it('should return cancel HTML page', async () => {
        const response = await request(app)
          .get('/api/callback/orange/cancel')
          .expect(200);

        expect(response.headers['content-type']).toContain('text/html');
        expect(response.text).toContain('Paiement annulé');
      });
    });

    describe('POST /api/callback/airtel', () => {
      it('should accept Airtel callback', async () => {
        const response = await request(app)
          .post('/api/callback/airtel')
          .send({
            transaction: {
              id: 'TXN-123',
              status: 'TS',
              amount: '10000'
            }
          })
          .expect(200);

        expect(response.body.received).toBe(true);
      });
    });
  });
});
