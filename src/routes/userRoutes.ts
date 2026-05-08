import { Router } from 'express';
import * as userController from '../controllers/userController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.get('/profile', authenticateToken, userController.getProfile);
router.put('/profile', authenticateToken, userController.updateProfile);
router.get('/search', authenticateToken, userController.searchUsers);
router.get('/:id', authenticateToken, userController.getUserById);

export default router;
