// Silence nodemailer — never send real emails in tests
jest.mock('../src/utils/mailer', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetConfirmationEmail: jest.fn().mockResolvedValue(undefined),
}));
