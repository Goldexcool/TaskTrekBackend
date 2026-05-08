import { Router } from 'express';
import * as columnController from '../controllers/columnController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.post('/', authenticateToken, columnController.createColumn);
router.get('/board/:boardId', authenticateToken, columnController.getColumnsByBoard);
router.put('/:id', authenticateToken, columnController.updateColumn);
router.delete('/:id', authenticateToken, columnController.deleteColumn);

export default router;
