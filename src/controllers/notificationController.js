const Notification = require('../models/Notification');
const mongoose = require('mongoose');


const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Query parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;
    const unreadOnly = req.query.unreadOnly === 'true';
    
    // Build query — scope to tenant if present
    const query = {
      recipient: userId,
      ...(req.tenantId && { tenant: req.tenantId })
    };
    if (unreadOnly) {
      query.read = false;
    }
    
    // Get notifications with pagination
    const notifications = await Notification.find(query)
      .populate('initiator', 'name username avatar')
      .populate('relatedTeam', 'name')
      .populate('relatedBoard', 'title')
      .populate('relatedTask', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
      
    // Count total for pagination
    const total = await Notification.countDocuments(query);
    
    // Count unread for badge
    const unreadCount = await Notification.countDocuments({ 
      recipient: userId,
      read: false 
    });
    
    return res.status(200).json({
      success: true,
      data: {
        notifications,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit
        },
        unreadCount
      }
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving notifications'
    });
  }
};

/**
 * Mark notifications as read
 * @route PATCH /api/notifications/read
 */
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationIds, all = false } = req.body;
    
    if (all) {
      // Mark all notifications as read
      await Notification.updateMany(
        { recipient: userId, read: false },
        { read: true }
      );
      
      return res.status(200).json({
        success: true,
        message: 'All notifications marked as read'
      });
    } else if (notificationIds && Array.isArray(notificationIds)) {
      await Notification.updateMany(
        { 
          _id: { $in: notificationIds },
          recipient: userId
        },
        { read: true }
      );
      
      return res.status(200).json({
        success: true,
        message: 'Notifications marked as read'
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid request - provide notificationIds array or all=true'
      });
    }
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating notifications'
    });
  }
};

/**
 * Delete a notification
 * @route DELETE /api/notifications/:id
 */
const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;
    
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: userId
    });
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or you do not have permission to delete it'
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting notification'
    });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  deleteNotification
};