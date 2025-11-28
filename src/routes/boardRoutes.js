const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const boardController = require('../controllers/boardController');
const taskController = require('../controllers/taskController');

/**
 * @swagger
 * tags:
 *   name: Boards
 *   description: Board and column management
 */

// Get all boards
/**
 * @swagger
 * /api/boards:
 *   get:
 *     summary: Get all boards for current user
 *     tags: [Boards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of boards
 */
router.get('/', authMiddleware.authenticateToken, boardController.getBoards);

// Create a new board
/**
 * @swagger
 * /api/boards:
 *   post:
 *     summary: Create a new board
 *     tags: [Boards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               teamId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Board created
 */
router.post('/', authMiddleware.authenticateToken, boardController.createBoard);

// Special routes should come BEFORE the /:id route
/**
 * @swagger
 * /api/boards/complete:
 *   get:
 *     summary: Get boards with columns and tasks
 *     tags: [Boards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Complete board data
 */
router.get('/complete', authMiddleware.authenticateToken, boardController.getAllBoardsComplete);

/**
 * @swagger
 * /api/boards/team/{teamId}:
 *   get:
 *     summary: Get boards for a specific team
 *     tags: [Boards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teamId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: List of boards
 */
router.get('/team/:teamId', authMiddleware.authenticateToken, boardController.getBoardsByTeam);

// Then the parameterized routes
/**
 * @swagger
 * /api/boards/{id}:
 *   get:
 *     summary: Get board by ID (with columns)
 *     tags: [Boards]
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
 *         description: Board details
 *       404:
 *         description: Board not found
 */
router.get('/:id', authMiddleware.authenticateToken, boardController.getBoardById);

// Update a board (PATCH for partial updates)
/**
 * @swagger
 * /api/boards/{id}:
 *   patch:
 *     summary: Update a board
 *     tags: [Boards]
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
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated board
 */
router.patch('/:id', authMiddleware.authenticateToken, boardController.updateBoard);

// Delete a board
/**
 * @swagger
 * /api/boards/{id}:
 *   delete:
 *     summary: Delete a board and its columns
 *     tags: [Boards]
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
 *         description: Board deleted
 */
router.delete('/:id', authMiddleware.authenticateToken, boardController.deleteBoard);

// Add a member to a board
/**
 * @swagger
 * /api/boards/{id}/members:
 *   post:
 *     summary: Add a member to a board
 *     tags: [Boards]
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
router.post('/:id/members', authMiddleware.authenticateToken, boardController.addMember);

// Remove a member from a board
/**
 * @swagger
 * /api/boards/{id}/members/{userId}:
 *   delete:
 *     summary: Remove a member from a board
 *     tags: [Boards]
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
router.delete('/:id/members/:userId', authMiddleware.authenticateToken, boardController.removeMember);

// Update member role
/**
 * @swagger
 * /api/boards/{id}/members/{userId}/role:
 *   patch:
 *     summary: Update a board member's role
 *     tags: [Boards]
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [admin, member, viewer]
 *     responses:
 *       200:
 *         description: Member role updated
 */
router.patch('/:id/members/:userId/role', authMiddleware.authenticateToken, boardController.updateMemberRole);

// Create column in board
/**
 * @swagger
 * /api/boards/{id}/columns:
 *   post:
 *     summary: Create a column in a board
 *     tags: [Boards]
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
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Column created
 */
router.post('/:id/columns', authMiddleware.authenticateToken, boardController.createColumn);

// Update column
/**
 * @swagger
 * /api/boards/{boardId}/columns/{columnId}:
 *   patch:
 *     summary: Update a column in a board
 *     tags: [Boards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: boardId
 *         schema:
 *           type: string
 *         required: true
 *       - in: path
 *         name: columnId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Column updated
 */
router.patch('/:boardId/columns/:columnId', authMiddleware.authenticateToken, boardController.updateColumn);

// Delete column
/**
 * @swagger
 * /api/boards/{boardId}/columns/{columnId}:
 *   delete:
 *     summary: Delete a column from a board
 *     tags: [Boards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: boardId
 *         schema:
 *           type: string
 *         required: true
 *       - in: path
 *         name: columnId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Column deleted
 */
router.delete('/:boardId/columns/:columnId', authMiddleware.authenticateToken, boardController.deleteColumn);

// Create a task in a column
/**
 * @swagger
 * /api/boards/{boardId}/columns/{columnId}/tasks:
 *   post:
 *     summary: Create a task in a column
 *     tags: [Boards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: boardId
 *         schema:
 *           type: string
 *         required: true
 *       - in: path
 *         name: columnId
 *         schema:
 *           type: string
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *     responses:
 *       201:
 *         description: Task created
 */
router.post('/:boardId/columns/:columnId/tasks', 
  authMiddleware.authenticateToken, 
  taskController.createTaskFromBody
);

// Share a board
/**
 * @swagger
 * /api/boards/{id}/share:
 *   post:
 *     summary: Share a board with users
 *     tags: [Boards]
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
 *               emails:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *               role:
 *                 type: string
 *                 enum: [admin, member, viewer]
 *     responses:
 *       200:
 *         description: Board shared
 */
router.post('/:id/share', authMiddleware.authenticateToken, boardController.shareBoard);

module.exports = router;