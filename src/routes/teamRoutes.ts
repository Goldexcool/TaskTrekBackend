import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import * as teamController from '../controllers/teamController';

const router = Router();

router.route('/')
  .post(authenticateToken, teamController.createTeam)
  .get(authenticateToken, teamController.getTeams);

router.get('/search', authenticateToken, teamController.searchTeams);
router.get('/exists/:teamId', teamController.checkTeamExists);
router.get('/me', authenticateToken, teamController.getUserTeams);

router.route('/:id')
  .get(authenticateToken, teamController.getTeamById)
  .put(authenticateToken, teamController.updateTeam)
  .delete(authenticateToken, teamController.deleteTeam);

router.get('/:id/members', authenticateToken, teamController.getTeamMembers);
router.post('/:id/members', authenticateToken, teamController.addMember);
router.delete('/:id/members/:userId', authenticateToken, teamController.removeMember);

export default router;
