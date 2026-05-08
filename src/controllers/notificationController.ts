import { Request, Response } from 'express';
import Notification from '../models/Notification';

const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const skip = (page - 1) * limit;
    const unreadOnly = req.query.unreadOnly === 'true';

    const query: Record<string, unknown> = {
      recipient: userId,
      ...(req.tenantId && { tenant: req.tenantId })
    };
    if (unreadOnly) {
      query.read = false;
    }

    const notifications = await Notification.find(query)
      .populate('initiator', 'name username avatar')
      .populate('relatedTeam', 'name')
      .populate('relatedBoard', 'title')
      .populate('relatedTask', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments(query);

    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      read: false
    });

    res.status(200).json({
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
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving notifications'
    });
  }
};

const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { notificationIds, all = false } = req.body as {
      notificationIds?: string[];
      all?: boolean;
    };

    if (all) {
      await Notification.updateMany({ recipient: userId, read: false }, { read: true });

      res.status(200).json({
        success: true,
        message: 'All notifications marked as read'
      });
      return;
    }

    if (notificationIds && Array.isArray(notificationIds)) {
      await Notification.updateMany(
        { _id: { $in: notificationIds }, recipient: userId },
        { read: true }
      );

      res.status(200).json({
        success: true,
        message: 'Notifications marked as read'
      });
      return;
    }

    res.status(400).json({
      success: false,
      message: 'Invalid request - provide notificationIds array or all=true'
    });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating notifications'
    });
  }
};

const deleteNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: userId
    });

    if (!notification) {
      res.status(404).json({
        success: false,
        message: 'Notification not found or you do not have permission to delete it'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting notification'
    });
  }
};

export { getNotifications, markAsRead, deleteNotification };
