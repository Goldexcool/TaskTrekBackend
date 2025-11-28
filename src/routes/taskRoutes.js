const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const authMiddleware = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Tasks
 *   description: Task management
 */

/**
 * @swagger
 * /api/tasks/all:
 *   get:
 *     summary: Get all tasks (admin/debug)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of tasks
 */
router.get('/all', authMiddleware.authenticateToken, taskController.getAllTasks);

/**
 * @swagger
 * /api/tasks/column/{columnId}:
 *   get:
 *     summary: Get tasks in a column
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: columnId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: List of tasks
 */
router.get('/column/:columnId', authMiddleware.authenticateToken, taskController.getTasksByColumn);

/**
 * @swagger
 * /api/tasks/user/{userId}:
 *   get:
 *     summary: Get tasks assigned to a user
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: List of tasks
 */
router.get('/user/:userId', authMiddleware.authenticateToken, taskController.getTasksByUser);

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Create a task (columnId in body)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, columnId]
 *             properties:
 *               title:
 *                 type: string
 *               columnId:
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
router.post('/', authMiddleware.authenticateToken, taskController.createTaskFromBody);

/**
 * @swagger
 * /api/tasks/{id}:
 *   get:
 *     summary: Get a task by ID
 *     tags: [Tasks]
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
 *         description: Task details
 *       404:
 *         description: Task not found
 */
router.get('/:id', authMiddleware.authenticateToken, taskController.getTaskById);

/**
 * @swagger
 * /api/tasks/{id}:
 *   patch:
 *     summary: Update a task
 *     tags: [Tasks]
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
 *         description: Updated task
 */
router.patch('/:id', authMiddleware.authenticateToken, taskController.updateTask);

/**
 * @swagger
 * /api/tasks/{id}/move:
 *   patch:
 *     summary: Move a task between columns / change order
 *     tags: [Tasks]
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
 *         description: Task moved
 */
router.patch('/:id/move', authMiddleware.authenticateToken, taskController.moveTask);

/**
 * @swagger
 * /api/tasks/{id}/complete:
 *   patch:
 *     summary: Mark a task as completed
 *     tags: [Tasks]
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
 *         description: Task completed
 */
router.patch('/:id/complete', authMiddleware.authenticateToken, taskController.completeTask);

/**
 * @swagger
 * /api/tasks/{id}/reopen:
 *   patch:
 *     summary: Reopen a completed task
 *     tags: [Tasks]
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
 *         description: Task reopened
 */
router.patch('/:id/reopen', authMiddleware.authenticateToken, taskController.reopenTask);

/**
 * @swagger
 * /api/tasks/{id}/assign:
 *   patch:
 *     summary: Assign a task to a user
 *     tags: [Tasks]
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
 *         description: Task assigned
 */
router.patch('/:id/assign', authMiddleware.authenticateToken, taskController.assignTask);

/**
 * @swagger
 * /api/tasks/{id}/unassign:
 *   patch:
 *     summary: Unassign a task
 *     tags: [Tasks]
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
 *         description: Task unassigned
 */
router.patch('/:id/unassign', authMiddleware.authenticateToken, taskController.unassignTask);

/**
 * @swagger
 * /api/tasks/{id}:
 *   delete:
 *     summary: Delete a task
 *     tags: [Tasks]
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
 *         description: Task deleted
 */
router.delete('/:id', authMiddleware.authenticateToken, taskController.deleteTask);


module.exports = router;