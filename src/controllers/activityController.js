const Activity = require('../models/Activity');
const Team = require('../models/Team');
const Board = require('../models/Board');
const Task = require('../models/Task');
const mongoose = require('mongoose');


const getUserActivityFeed = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    
    // Get user's boards
    const boards = await Board.find({
      $or: [
        { createdBy: userId },
        { 'members.user': userId }
      ]
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
    
    const activityQuery = {
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
    
    return res.status(200).json({
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
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching activity feed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


const getTeamActivityFeed = async (req, res) => {
  try {
    const { teamId } = req.params;
    
    const options = {
      limit: parseInt(req.query.limit) || 20,
      page: parseInt(req.query.page) || 1,
      teamId, // Explicitly filter by this team
      actionType: req.query.actionType,
      boardId: req.query.boardId,
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    
    const activityFeed = await getUserActivityFeed(req.user.id, options);
    
    res.status(200).json({
      success: true,
      data: activityFeed.activities,
      pagination: activityFeed.pagination
    });
  } catch (error) {
    console.error('Error fetching team activity feed:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching team activity feed'
    });
  }
};


const getBoardActivityFeed = async (req, res) => {
  try {
    const { boardId } = req.params;
    
    // Verify the user has access to this board
    const board = await Board.findById(boardId).populate('team');
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }
    
    // Check if user is in the team that owns the board
    const isTeamMember = board.team.members.some(
      member => member.user.toString() === req.user.id
    );
    
    if (!isTeamMember) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this board'
      });
    }
    
    const options = {
      limit: parseInt(req.query.limit) || 20,
      page: parseInt(req.query.page) || 1,
      boardId,
      actionType: req.query.actionType,
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    
    const activityFeed = await getUserActivityFeed(req.user.id, options);
    
    res.status(200).json({
      success: true,
      data: activityFeed.activities,
      pagination: activityFeed.pagination
    });
  } catch (error) {
    console.error('Error fetching board activity feed:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching board activity feed'
    });
  }
};

const getTaskActivityFeed = async (req, res) => {
  try {
    const { taskId } = req.params;
    
    // Verify the user has access to this task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // Get the board and verify access
    const board = await Board.findById(task.board).populate('team');
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }
    
    // Check if user is in the team that owns the board
    const isTeamMember = board.team.members.some(
      member => member.user.toString() === req.user.id
    );
    
    if (!isTeamMember) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this task'
      });
    }
    
    const options = {
      limit: parseInt(req.query.limit) || 20,
      page: parseInt(req.query.page) || 1
    };
    
    // Get activities for this task
    const activities = await Activity.find({ task: taskId })
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate('user', 'name username email avatar')
      .populate('targetUser', 'name username email avatar');
    
    const total = await Activity.countDocuments({ task: taskId });
    
    res.status(200).json({
      success: true,
      data: activities,
      pagination: {
        total,
        page: options.page,
        limit: options.limit,
        pages: Math.ceil(total / options.limit)
      }
    });
  } catch (error) {
    console.error('Error fetching task activity feed:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching task activity feed'
    });
  }
};

const getPersonalTaskActivityFeed = async (req, res) => {
  try {
    const options = {
      limit: parseInt(req.query.limit) || 20,
      page: parseInt(req.query.page) || 1,
      actionType: req.query.actionType,
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    
    // Get personal task activities
    const activities = await Activity.find({ 
      $and: [
        { user: req.user.id },
        { 
          $or: [
            { actionType: { $regex: /^personal_task_/ } },
            { actionType: { $in: [
              'create_personal_task',
              'update_personal_task',
              'delete_personal_task',
              'complete_personal_task',
              'reopen_personal_task',
              'assign_personal_task',
              'unassign_personal_task',
              'archive_personal_task',
              'unarchive_personal_task'
            ]} }
          ]
        }
      ]
    })
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate('user', 'name username email avatar')
      .populate('targetUser', 'name username email avatar')
      .populate('personalTask', 'title description');
    
    const total = await Activity.countDocuments({ 
      $and: [
        { user: req.user.id },
        { 
          $or: [
            { actionType: { $regex: /^personal_task_/ } },
            { actionType: { $in: [
              'create_personal_task',
              'update_personal_task',
              'delete_personal_task',
              'complete_personal_task',
              'reopen_personal_task',
              'assign_personal_task',
              'unassign_personal_task',
              'archive_personal_task',
              'unarchive_personal_task'
            ]} }
          ]
        }
      ]
    });
    
    res.status(200).json({
      success: true,
      data: activities,
      pagination: {
        total,
        page: options.page,
        limit: options.limit,
        pages: Math.ceil(total / options.limit)
      }
    });
  } catch (error) {
    console.error('Error fetching personal task activity feed:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching personal task activity feed'
    });
  }
};

const getUserActivityFeedById = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const options = {
      limit: parseInt(req.query.limit) || 20,
      page: parseInt(req.query.page) || 1,
      actionType: req.query.actionType,
      teamId: req.query.teamId,
      boardId: req.query.boardId,
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    
    const activityFeed = await getUserActivityFeed(userId, options);
    
    res.status(200).json({
      success: true,
      data: activityFeed.activities,
      pagination: activityFeed.pagination
    });
  } catch (error) {
    console.error('Error fetching user activity feed:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching user activity feed'
    });
  }
};

const generateRetroactiveActivities = async (req, res) => {
  try {
    const userId = req.user.id;
    const userName = req.user.name || req.user.username || 'User';
    
    console.log(`Starting simplified activity generation for user ${userId}`);
    
    // Create several basic activities without additional database lookups
    const activities = [];
    
    // Check connection state before attempting database operations
    const isConnected = mongoose.connection.readyState === 1;
    
    if (!isConnected) {
      return res.status(503).json({
        success: false,
        message: 'Database connection not available',
        details: 'The application is currently unable to connect to the database'
      });
    }
    
    // Create a promise with timeout for the database operation
    const createActivityWithTimeout = async (activityData) => {
      return new Promise(async (resolve, reject) => {
        // Set a timeout for the operation
        const timeout = setTimeout(() => {
          reject(new Error('Database operation timed out after 5000ms'));
        }, 5000);
        
        try {
          // Perform the database operation
          const activity = new Activity(activityData);
          const savedActivity = await activity.save();
          
          // Clear the timeout since operation completed
          clearTimeout(timeout);
          resolve(savedActivity);
        } catch (error) {
          // Clear the timeout since operation failed
          clearTimeout(timeout);
          reject(error);
        }
      });
    };
    
    // Activity 1: System login
    try {
      const loginActivity = await createActivityWithTimeout({
        actionType: 'system_generated',
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
      activities: activities.map(a => ({
        id: a._id,
        type: a.actionType,
        description: a.description
      }))
    });
  } catch (error) {
    console.error('Error generating activities:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error generating activities'
    });
  }
};

module.exports = {
  getUserActivityFeed,
  getTeamActivityFeed,
  getBoardActivityFeed,
  getTaskActivityFeed,
  getPersonalTaskActivityFeed,
  getUserActivityFeedById,
  generateRetroactiveActivities
};