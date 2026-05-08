import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { resolveTenant, requireTenantAdmin, requireTenantOwner } from '../middleware/tenantMiddleware';
import {
  createTenant,
  getMyTenants,
  getCurrentTenant,
  getTenantById,
  updateTenant,
  deleteTenant,
  getMembers,
  addMember,
  updateMemberRole,
  removeMember,
  switchTenant
} from '../controllers/tenantController';

const router = Router();

router.use(authenticateToken);

router.post('/', createTenant);
router.get('/', getMyTenants);
router.get('/current', resolveTenant, getCurrentTenant);

router.get('/:tenantId', getTenantById);
router.patch('/:tenantId', resolveTenant, requireTenantAdmin, updateTenant);
router.delete('/:tenantId', resolveTenant, requireTenantOwner, deleteTenant);

router.get('/:tenantId/members', resolveTenant, getMembers);
router.post('/:tenantId/members', resolveTenant, requireTenantAdmin, addMember);
router.patch('/:tenantId/members/:userId/role', resolveTenant, requireTenantAdmin, updateMemberRole);
router.delete('/:tenantId/members/:userId', resolveTenant, requireTenantAdmin, removeMember);

router.post('/:tenantId/switch', resolveTenant, switchTenant);

export default router;
