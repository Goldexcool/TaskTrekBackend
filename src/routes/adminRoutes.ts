import { Router } from 'express';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware';
import {
  getPlatformStats,
  listUsers,
  getUserDetail,
  updateUserRole,
  deleteUser,
  listTenants,
  getTenantDetail,
  updateTenantStatus
} from '../controllers/adminController';

const router = Router();

// All admin routes require a valid JWT AND platform-level admin role
router.use(authenticateToken, isAdmin);

// Platform stats
router.get('/stats', getPlatformStats);

// User management
router.get('/users', listUsers);
router.get('/users/:userId', getUserDetail);
router.patch('/users/:userId/role', updateUserRole);
router.delete('/users/:userId', deleteUser);

// Tenant management
router.get('/tenants', listTenants);
router.get('/tenants/:tenantId', getTenantDetail);
router.patch('/tenants/:tenantId/status', updateTenantStatus);

export default router;
