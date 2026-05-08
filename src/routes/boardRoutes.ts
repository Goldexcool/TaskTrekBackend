import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import * as boardController from '../controllers/boardController';
import * as taskController from '../controllers/taskController';

const router = Router();

router.get('/', authenticateToken, boardController.getBoards);
router.post('/', authenticateToken, boardController.createBoard);
router.get('/complete', authenticateToken, boardController.getAllBoardsComplete);
router.get('/team/:teamId', authenticateToken, boardController.getBoardsByTeam);

router.get('/:id', authenticateToken, boardController.getBoardById);
router.patch('/:id', authenticateToken, boardController.updateBoard);
router.delete('/:id', authenticateToken, boardController.deleteBoard);

router.post('/:id/members', authenticateToken, boardController.addMember);
router.delete('/:id/members/:userId', authenticateToken, boardController.removeMember);
router.patch('/:id/members/:userId/role', authenticateToken, boardController.updateMemberRole);

router.post('/:id/columns', authenticateToken, boardController.createColumn);
router.patch('/:boardId/columns/:columnId', authenticateToken, boardController.updateColumn);
router.delete('/:boardId/columns/:columnId', authenticateToken, boardController.deleteColumn);

router.post(
  '/:boardId/columns/:columnId/tasks',
  authenticateToken,
  taskController.createTaskFromBody
);

router.post('/:id/share', authenticateToken, boardController.shareBoard);

export default router;
