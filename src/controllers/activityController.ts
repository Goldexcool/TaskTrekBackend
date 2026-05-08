import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Activity from '../models/Activity';
import Team from '../models/Team';
import Board from '../models/Board';
import Task from '../models/Task';

const getUserActivityFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 10;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;

    // Get user's boards
    const boards = await Board.find({
      $or: [{ createdBy: userId }, { 'members.user': userId }]
    }).select('_id');

    const boardIds = boards.map(board => board._id);

    // Get user's teams
    const teams = await Team.find({
      $or: [
        { owner: userId },
        { admins: userId },
        { 'members.user': userId }
      ]
    }).select('_id');

    const teamIds = teams.map(team => team._id);

    const activityQuery: Record<string, unknown> = {
      $or: [
        { user: userId },
        { boardId: { $in: boardIds } },
        { teamId: { $in: teamIds } }
      ],
      ...(req.tenantId && { tenant: req.tenantId })
    };

    const activities = await Activity.find(activityQuery)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name username avatar');

    const total = await Activity.countDocuments(activityQuery);

    res.status(200).json({
      success: true,
      data: activities,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      }
    });
  } catch (error) {
    console.error('Error fetching activity feed:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching activity feed',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

const getTeamActivityFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const { teamId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;

    const activityQuery: Record<string, unknown> = { teamId };

    const activities = await Activity.find(activityQuery)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name username avatar');

    const total = await Activity.countDocuments(activityQuery);

    res.status(200).json({
      success: true,
      data: activities,
      pagination: { total, page, pages: Math.ceil(total / limit), limit }
    });
  } catch (error) {
    console.error('Error fetching team activity feed:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Error fetching team activity feed'
    });
  }
};

const getBoardActivityFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const { boardId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;

    const board = await Board.findById(boardId);
    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    const activityQuery = { boardId };

    const activities = await Activity.find(activityQuery)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name username avatar');

    const total = await Activity.countDocuments(activityQuery);

    res.status(200).json({
      success: true,
      data: activities,
      pagination: { total, page, pages: Math.ceil(total / limit), limit }
    });
  } catch (error) {
    console.error('Error fetching board activity feed:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Error fetching board activity feed'
    });
  }
};

const getTaskActivityFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;

    const task = await Task.findById(taskId);
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    const activities = await Activity.find({ taskId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name username email avatar');

    const total = await Activity.countDocuments({ taskId });

    res.status(200).json({
      success: true,
      data: activities,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Error fetching task activity feed:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Error fetching task activity feed'
    });
  }
};

const getPersonalTaskActivityFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;

    const activities = await Activity.find({ user: req.user!.id })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name username email avatar');

    const total = await Activity.countDocuments({ user: req.user!.id });

    res.status(200).json({
      success: true,
      data: activities,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Error fetching personal task activity feed:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Error fetching personal task activity feed'
    });
  }
};

const getUserActivityFeedById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;

    const activityQuery = { user: userId };

    const activities = await Activity.find(activityQuery)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name username avatar');

    const total = await Activity.countDocuments(activityQuery);

    res.status(200).json({
      success: true,
      data: activities,
      pagination: { total, page, pages: Math.ceil(total / limit), limit }
    });
  } catch (error) {
    console.error('Error fetching user activity feed:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Error fetching user activity feed'
    });
  }
};

const generateRetroactiveActivities = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const userName = (req.user as { id: string; name?: string; username?: string }).name ||
      (req.user as { id: string; name?: string; username?: string }).username || 'User';

    console.log(`Starting simplified activity generation for user ${userId}`);

    const activities: unknown[] = [];

    const isConnected = mongoose.connection.readyState === 1;

    if (!isConnected) {
      res.status(503).json({
        success: false,
        message: 'Database connection not available',
        details: 'The application is currently unable to connect to the database'
      });
      return;
    }

    const createActivityWithTimeout = async (
      activityData: Record<string, unknown>
    ): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Database operation timed out after 5000ms'));
        }, 5000);

        const activity = new Activity(activityData);
        activity
          .save()
          .then(saved => {
            clearTimeout(timeout);
            resolve(saved);
          })
          .catch(err => {
            clearTimeout(timeout);
            reject(err);
          });
      });
    };

    try {
      const loginActivity = await createActivityWithTimeout({
        action: 'created_board',
        user: userId,
        description: `${userName} logged into TaskTrek`,
        metadata: {
          activityType: 'login',
          retroactive: true,
          generatedAt: new Date(),
          browser: req.headers['user-agent']
        }
      });

      activities.push(loginActivity);
      console.log('Created login activity');
    } catch (err) {
      console.error('Failed to create login activity:', err);
    }

    res.status(200).json({
      success: true,
      message: `Generated ${activities.length} basic activity records`,
      activities: (activities as Array<{ _id: unknown }>).map(a => ({
        id: a._id
      }))
    });
  } catch (error) {
    console.error('Error generating activities:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Error generating activities'
    });
  }
};

export {
  getUserActivityFeed,
  getTeamActivityFeed,
  getBoardActivityFeed,
  getTaskActivityFeed,
  getPersonalTaskActivityFeed,
  getUserActivityFeedById,
  generateRetroactiveActivities
};
