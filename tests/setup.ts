/**
 * Jest setup file
 * Runs before all tests
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.MOCK_MODE = 'true';
process.env.API_SECRET_KEY = 'test_secret_key_for_testing';

// Suppress console logs during tests (optional)
// Uncomment to silence logs:
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
// };

// Increase timeout for async tests
jest.setTimeout(10000);
