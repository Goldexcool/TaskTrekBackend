import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import * as notificationController from '../controllers/notificationController';

const router = Router();

router.get('/', authenticateToken, notificationController.getNotifications);
router.patch('/read', authenticateToken, notificationController.markAsRead);
router.delete('/:id', authenticateToken, notificationController.deleteNotification);

export default router;
