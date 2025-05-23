const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.get('/profile', authenticateToken, userController.getProfile);

router.put('/profile', authenticateToken, userController.updateProfile);

router.get('/:id', authenticateToken, userController.getUserById);

module.exports = router;