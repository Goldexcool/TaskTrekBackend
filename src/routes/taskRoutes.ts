import { Router } from 'express';
import * as taskController from '../controllers/taskController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.get('/all', authenticateToken, taskController.getAllTasks);
router.get('/column/:columnId', authenticateToken, taskController.getTasksByColumn);
router.get('/user/:userId', authenticateToken, taskController.getTasksByUser);
router.post('/', authenticateToken, taskController.createTaskFromBody);
router.get('/:id', authenticateToken, taskController.getTaskById);
router.patch('/:id', authenticateToken, taskController.updateTask);
router.patch('/:id/move', authenticateToken, taskController.moveTask);
router.patch('/:id/complete', authenticateToken, taskController.completeTask);
router.patch('/:id/reopen', authenticateToken, taskController.reopenTask);
router.patch('/:id/assign', authenticateToken, taskController.assignTask);
router.patch('/:id/unassign', authenticateToken, taskController.unassignTask);
router.delete('/:id', authenticateToken, taskController.deleteTask);

export default router;
