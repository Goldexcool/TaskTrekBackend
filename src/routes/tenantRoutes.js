/**
 * @swagger
 * tags:
 *   name: Tenants
 *   description: Organization / workspace management
 */

/**
 * @swagger
 * components:
 *   parameters:
 *     TenantIdHeader:
 *       in: header
 *       name: x-tenant-id
 *       schema:
 *         type: string
 *       description: MongoDB ObjectId of the active organization
 *     TenantSlugHeader:
 *       in: header
 *       name: x-tenant-slug
 *       schema:
 *         type: string
 *       description: URL-safe slug of the active organization (alternative to x-tenant-id)
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { resolveTenant, requireTenantAdmin, requireTenantOwner } = require('../middleware/tenantMiddleware');
const {
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
} = require('../controllers/tenantController');

// All tenant routes require authentication
router.use(authenticateToken);

/**
 * @swagger
 * /api/tenants:
 *   post:
 *     summary: Create a new organization
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               logo:
 *                 type: string
 *     responses:
 *       201:
 *         description: Organization created
 *       400:
 *         description: Validation error
 */
router.post('/', createTenant);

/**
 * @swagger
 * /api/tenants:
 *   get:
 *     summary: List organizations the current user belongs to
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of organizations
 */
router.get('/', getMyTenants);

/**
 * @swagger
 * /api/tenants/current:
 *   get:
 *     summary: Get the currently active organization (resolved from header or user preference)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TenantIdHeader'
 *       - $ref: '#/components/parameters/TenantSlugHeader'
 *     responses:
 *       200:
 *         description: Active organization
 *       400:
 *         description: No tenant context provided
 */
router.get('/current', resolveTenant, getCurrentTenant);

/**
 * @swagger
 * /api/tenants/{tenantId}:
 *   get:
 *     summary: Get organization by ID
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organization data
 *       403:
 *         description: Not a member
 *       404:
 *         description: Not found
 */
router.get('/:tenantId', getTenantById);

/**
 * @swagger
 * /api/tenants/{tenantId}:
 *   patch:
 *     summary: Update organization (admin/owner)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TenantIdHeader'
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated
 *       403:
 *         description: Insufficient privileges
 */
router.patch('/:tenantId', resolveTenant, requireTenantAdmin, updateTenant);

/**
 * @swagger
 * /api/tenants/{tenantId}:
 *   delete:
 *     summary: Delete organization (owner only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TenantIdHeader'
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 *       403:
 *         description: Owner only
 */
router.delete('/:tenantId', resolveTenant, requireTenantOwner, deleteTenant);

/**
 * @swagger
 * /api/tenants/{tenantId}/members:
 *   get:
 *     summary: List organization members
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TenantIdHeader'
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member list
 */
router.get('/:tenantId/members', resolveTenant, getMembers);

/**
 * @swagger
 * /api/tenants/{tenantId}/members:
 *   post:
 *     summary: Add a member to the organization (admin/owner)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TenantIdHeader'
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, member, viewer]
 *     responses:
 *       201:
 *         description: Member added
 */
router.post('/:tenantId/members', resolveTenant, requireTenantAdmin, addMember);

/**
 * @swagger
 * /api/tenants/{tenantId}/members/{userId}/role:
 *   patch:
 *     summary: Update a member's role (admin/owner)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TenantIdHeader'
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role updated
 */
router.patch('/:tenantId/members/:userId/role', resolveTenant, requireTenantAdmin, updateMemberRole);

/**
 * @swagger
 * /api/tenants/{tenantId}/members/{userId}:
 *   delete:
 *     summary: Remove a member from the organization (admin/owner)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TenantIdHeader'
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed
 */
router.delete('/:tenantId/members/:userId', resolveTenant, requireTenantAdmin, removeMember);

/**
 * @swagger
 * /api/tenants/{tenantId}/switch:
 *   post:
 *     summary: Switch active organization context
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TenantIdHeader'
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Switched
 */
router.post('/:tenantId/switch', resolveTenant, switchTenant);

module.exports = router;
