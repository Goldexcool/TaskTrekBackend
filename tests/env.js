// Pure env vars — loaded before any module (setupFiles runs before Jest framework)
process.env.NODE_ENV = 'test';
// Use the same value so tokens work for both authMiddleware (JWT_SECRET)
// and authController.authenticateToken (ACCESS_TOKEN_SECRET)
process.env.JWT_SECRET = 'test-shared-secret-for-testing-only';
process.env.ACCESS_TOKEN_SECRET = 'test-shared-secret-for-testing-only';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-min-x';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/tasktrek_test';
process.env.PORT = '0';
