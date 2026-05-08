import { Router } from 'express';
import * as activityController from '../controllers/activityController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.get('/', authenticateToken, activityController.getUserActivityFeed);
router.get('/feed', authenticateToken, activityController.getUserActivityFeed);
router.get('/personal', authenticateToken, activityController.getPersonalTaskActivityFeed);
router.post('/generate', authenticateToken, activityController.generateRetroactiveActivities);
router.get('/team/:teamId', authenticateToken, activityController.getTeamActivityFeed);
router.get('/board/:boardId', authenticateToken, activityController.getBoardActivityFeed);
router.get('/task/:taskId', authenticateToken, activityController.getTaskActivityFeed);
router.get('/user/:userId', authenticateToken, activityController.getUserActivityFeedById);

export default router;
