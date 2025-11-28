const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const teamController = require('../controllers/teamController');

/**
 * @swagger
 * tags:
 *   name: Teams
 *   description: Team management
 */

/**
 * @swagger
 * /api/teams:
 *   post:
 *     summary: Create a new team
 *     tags: [Teams]
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
 *     responses:
 *       201:
 *         description: Team created
 */
router.route('/')
  .post(authMiddleware.authenticateToken, teamController.createTeam)
  /**
   * @swagger
   * /api/teams:
   *   get:
   *     summary: Get teams for current user
   *     tags: [Teams]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of teams
   */
  .get(authMiddleware.authenticateToken, teamController.getTeams);

/**
 * @swagger
 * /api/teams/search:
 *   get:
 *     summary: Search teams by name or description
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         required: true
 *         description: Search term
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search', authMiddleware.authenticateToken, teamController.searchTeams);

/**
 * @swagger
 * /api/teams/exists/{teamId}:
 *   get:
 *     summary: Check if a team exists by ID
 *     tags: [Teams]
 *     parameters:
 *       - in: path
 *         name: teamId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Existence info
 */
router.get('/exists/:teamId', teamController.checkTeamExists);

/**
 * @swagger
 * /api/teams/me:
 *   get:
 *     summary: Get all teams associated with current user
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of teams
 */
router.get('/me', authMiddleware.authenticateToken, teamController.getUserTeams);

router.route('/:id')
  /**
   * @swagger
   * /api/teams/{id}:
   *   get:
   *     summary: Get team by ID
   *     tags: [Teams]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         schema:
   *           type: string
   *         required: true
   *     responses:
   *       200:
   *         description: Team details
   */
  .get(authMiddleware.authenticateToken, teamController.getTeamById)
  /**
   * @swagger
   * /api/teams/{id}:
   *   put:
   *     summary: Update a team
   *     tags: [Teams]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         schema:
   *           type: string
   *         required: true
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *     responses:
   *       200:
   *         description: Updated team
   */
  .put(authMiddleware.authenticateToken, teamController.updateTeam) 
  /**
   * @swagger
   * /api/teams/{id}:
   *   delete:
   *     summary: Delete a team
   *     tags: [Teams]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         schema:
   *           type: string
   *         required: true
   *     responses:
   *       200:
   *         description: Team deleted
   */
  .delete(authMiddleware.authenticateToken, teamController.deleteTeam);

/**
 * @swagger
 * /api/teams/{id}/members:
 *   get:
 *     summary: Get members of a team
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Team members
 */
router.get('/:id/members', authMiddleware.authenticateToken, teamController.getTeamMembers);

/**
 * @swagger
 * /api/teams/{id}/members:
 *   post:
 *     summary: Add a member to a team
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [admin, member, viewer]
 *     responses:
 *       200:
 *         description: Member added
 */
router.post('/:id/members', authMiddleware.authenticateToken, teamController.addMember);

/**
 * @swagger
 * /api/teams/{id}/members/{userId}:
 *   delete:
 *     summary: Remove a member from a team
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Member removed
 */
router.delete('/:id/members/:userId', authMiddleware.authenticateToken, teamController.removeMember);

module.exports = router;