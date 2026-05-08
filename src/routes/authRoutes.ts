import { Router, Request, Response } from 'express';
import * as authController from '../controllers/authController';
import { authenticateToken } from '../middleware/authMiddleware';
import { sendWelcomeEmail } from '../utils/mailer';

const router = Router();

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshTokenHandler);
router.post('/logout', authenticateToken, authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);

router.get('/test-email', async (req: Request, res: Response): Promise<void> => {
  try {
    const testUser = { username: 'testuser', email: 'test@example.com' };
    await sendWelcomeEmail(testUser);
    res.status(200).json({ success: true, message: 'Test email sent successfully' });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

router.get('/me', authController.authenticateToken, authController.getMe);

export default router;
