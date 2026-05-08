const Task = require('../models/Task');
const Column = require('../models/Column');
const Board = require('../models/Board');
const Team = require('../models/Team'); 
const User = require('../models/User'); 
const Activity = require('../models/Activity');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');

/**
 * Check if a user has permission to access a board
 */
const checkBoardPermission = async (board, userId) => {
  // Always return true to allow all users access to all tasks/boards
  return true;
};

/**
 * Create a task from board/column route
 */
const createTask = async (req, res) => {
  try {
    const { boardId, columnId } = req.params;
    const { title, description, priority = 'medium', dueDate, assignedTo } = req.body;

    // Validate input
    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Task title is required'
      });
    }

    // Check if board and column exist
    const board = await Board.findById(boardId);
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }

    const column = await Column.findOne({ _id: columnId, board: boardId });
    if (!column) {
      return res.status(404).json({
        success: false,
        message: 'Column not found in this board'
      });
    }

    // Check permission
    const hasPermission = await checkBoardPermission(board, req.user.id);
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create tasks in this board'
      });
    }

    // Get max order in the column
    const maxOrderTask = await Task.findOne({ column: columnId })
      .sort({ order: -1 })
      .limit(1);
    
    const order = maxOrderTask ? maxOrderTask.order + 1 : 0;

    // Handle assignedTo field
    let taskAssignee = null;

    if (assignedTo) {
      if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
        // Enhanced search to include email as well
        const user = await User.findOne({
          $or: [
            { name: { $regex: new RegExp(assignedTo, 'i') } },
            { username: { $regex: new RegExp(assignedTo, 'i') } },
            { email: { $regex: new RegExp(assignedTo, 'i') } }
          ]
        });
        
        if (user) {
          taskAssignee = user._id;
        } else {
          return res.status(400).json({
            success: false,
            message: `Could not find user "${assignedTo}"`
          });
        }
      } else {
        taskAssignee = assignedTo;
      }
    }

    const task = await Task.create({
      title,
      description: description || '',
      priority: priority || 'medium',
      dueDate,
      assignedTo: taskAssignee,
      createdBy: req.user.id,
      board: boardId,
      column: columnId,
      order,
      team: board.team,
      ...(req.tenantId && { tenant: req.tenantId })
    });

    const populatedTask = await Task.findById(task._id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate({
        path: 'board',
        select: 'title description'
      })
      .populate({
        path: 'column',
        select: 'name order'
      })
      .populate({
        path: 'team',
        select: 'name'
      });

    // Log activity
    try {
      await Activity.create({
        user: req.user.id,
        action: 'created_task',
        taskId: task._id,
        boardId,
        columnId,
        teamId: board.team,
        description: `Created task "${task.title}"`,
        metadata: { 
          taskTitle: title,
          priority,
          assignedTo: taskAssignee
        }
      });
    } catch (activityError) {
      console.error('Activity logging error:', activityError);
    }

    return res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: {
        ...populatedTask._doc,
        isCompleted: false
      }
    });
  } catch (error) {
    console.error('Create task error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while creating task',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create a task (client-friendly version that accepts columnId in body)
 * @route POST /api/tasks
 * @access Private
 */
const createTaskFromBody = async (req, res) => {
  try {
    const { title, columnId, position, description, priority, dueDate, assignedTo } = req.body;
    
    if (!columnId || !title) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: columnId and title are required'
      });
    }
    
    const column = await Column.findById(columnId);
    if (!column) {
      return res.status(404).json({
        success: false,
        message: 'Column not found'
      });
    }
    
    const boardId = column.board;
    
    const board = await Board.findById(boardId);
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }

    let taskAssignee = null;

    if (assignedTo) {
      if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
        // Enhanced search to include email as well
        const user = await User.findOne({
          $or: [
            { name: { $regex: new RegExp(assignedTo, 'i') } },
            { username: { $regex: new RegExp(assignedTo, 'i') } },
            { email: { $regex: new RegExp(assignedTo, 'i') } }
          ]
        });
        
        if (user) {
          taskAssignee = user._id;
        } else {
          return res.status(400).json({
            success: false,
            message: `Could not find user "${assignedTo}"`
          });
        }
      } else {
        taskAssignee = assignedTo;
      }
    }

    let order = position;
    if (order === undefined) {
      const maxOrderTask = await Task.findOne({ column: columnId })
        .sort({ order: -1 })
        .limit(1);
      
      order = maxOrderTask ? maxOrderTask.order + 1 : 0;
    }

    const task = await Task.create({
      title,
      description: description || '',
      priority: priority || 'medium',
      dueDate,
      assignedTo: taskAssignee,
      createdBy: req.user.id,
      board: boardId,
      column: columnId,
      order,
      team: board.team,
      ...(req.tenantId && { tenant: req.tenantId })
    });

    const populatedTask = await Task.findById(task._id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate({
        path: 'board',
        select: 'title description'
      })
      .populate({
        path: 'column',
        select: 'name order'
      })
      .populate({
        path: 'team',
        select: 'name'
      });

    // Create activity
    try {
      await Activity.create({
        user: req.user.id,
        action: 'created_task',
        taskId: task._id,
        boardId,
        columnId,
        teamId: board.team,
        description: `Created task "${task.title}"`,
        metadata: { 
          taskTitle: title,
          priority,
          assignedTo: taskAssignee
        }
      });
    } catch (activityError) {
      console.error('Activity logging error:', activityError);
    }

    return res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: {
        ...populatedTask._doc,
        isCompleted: false
      }
    });
  } catch (error) {
    console.error('Create task error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while creating task',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getAllTasks = async (req, res) => {
  try {
    // Get all tasks without filtering by user
    const allTasksFilter = req.tenantId ? { tenant: req.tenantId } : {};
    const tasks = await Task.find(allTasksFilter)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({
        path: 'board',
        select: 'title description'
      })
      .populate({
        path: 'column',
        select: 'name order'
      })
      .populate({
        path: 'team',
        select: 'name'
      })
      .sort({ updatedAt: -1 });
    
    // Add isCompleted flag based on status
    const tasksWithStatus = tasks.map(task => ({
      ...task._doc,
      isCompleted: task.status === 'done'
    }));
    
    return res.status(200).json({
      success: true,
      count: tasksWithStatus.length,
      data: tasksWithStatus
    });
  } catch (error) {
    console.error('Get all tasks error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching tasks',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getTaskById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (id === 'all') {
      return getAllTasks(req, res);
    }
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid task ID format'
      });
    }

    const task = await Task.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({
        path: 'board',
        select: 'title description createdBy members team'
      })
      .populate({
        path: 'column',
        select: 'name order'
      });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...task._doc,
        isCompleted: task.status === 'done'
      }
    });
  } catch (error) {
    console.error('Get task by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching task',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Move a task between columns or change order
 */
const moveTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { destinationColumnId, order } = req.body;

    if (destinationColumnId === undefined && order === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Either destinationColumnId or order is required'
      });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const board = await Board.findById(task.board);
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Associated board not found'
      });
    }

    // Check user permission
    const hasPermission = await checkBoardPermission(board, req.user.id);
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to move tasks in this board'
      });
    }

    // Store original values for activity log
    const originalColumnId = task.column;
    const originalOrder = task.order;

    // Update column if provided
    if (destinationColumnId) {
      // Verify the destination column belongs to the same board
      const destinationColumn = await Column.findOne({
        _id: destinationColumnId,
        board: task.board
      });

      if (!destinationColumn) {
        return res.status(400).json({
          success: false,
          message: 'Destination column not found in this board'
        });
      }

      task.column = destinationColumnId;
    }

    // Update order if provided
    if (order !== undefined) {
      task.order = order;
    }

    // Update timestamps
    task.updatedAt = Date.now();

    await task.save();

    // Log activity
    await Activity.create({
      user: req.user.id,
      action: 'moved_task',
      taskId: task._id,
      boardId: task.board,
      columnId: task.column,
      metadata: {
        taskTitle: task.title,
        fromColumn: originalColumnId,
        toColumn: destinationColumnId || task.column,
        fromOrder: originalOrder,
        toOrder: order
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Task moved successfully',
      data: task
    });
  } catch (error) {
    console.error('Move task error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while moving task',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update a task - enhanced with assignment functionality
 */
const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, dueDate, status, assignedTo, unassign } = req.body;
    
    console.log(`Updating task ${id}`, req.body);
    
    const task = await Task.findById(id);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // Store previous assignment for activity logging
    const previouslyAssignedId = task.assignedTo ? task.assignedTo.toString() : null;
    let previousUser = null;
    
    if (previouslyAssignedId) {
      try {
        previousUser = await User.findById(previouslyAssignedId).select('name username');
      } catch (userError) {
        console.error('Error finding previous user:', userError);
      }
    }
    
    // Handle updates to basic fields
    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (priority !== undefined) task.priority = priority;
    if (dueDate !== undefined) task.dueDate = dueDate;
    if (status !== undefined) {
      // Map common status values to valid enum values (convert to lowercase for case-insensitive comparison)
      const statusMap = {
        'completed': 'done',
        'complete': 'done',
        'finished': 'done',
        'done': 'done', 
        'pending': 'todo',
        'in-progress': 'todo',
        'inprogress': 'todo',
        'in progress': 'todo',
        'todo': 'todo' 
      };

      // Use the mapped value if available, otherwise fallback to a default value
      const statusLower = status.toLowerCase();
      task.status = statusMap[statusLower] || 'todo';
    }
    
    // Handle assignment/unassignment
    let assignActivity = null;
    let assignedUser = null;
    
    // Explicit unassignment takes precedence
    if (unassign === true) {
      task.assignedTo = null;
      assignActivity = 'unassigned_task';
    } 
    // Otherwise check if we need to assign
    else if (assignedTo) {
      // Handle user ID lookup - try both ObjectId and name/email/username
      if (mongoose.Types.ObjectId.isValid(assignedTo)) {
        // If it's a valid ObjectId, look up directly
        assignedUser = await User.findById(assignedTo);
      } else {
        // Try to find by name, username or email (case insensitive)
        assignedUser = await User.findOne({
          $or: [
            { name: { $regex: new RegExp(`^${assignedTo}$`, 'i') } },
            { username: { $regex: new RegExp(`^${assignedTo}$`, 'i') } },
            { email: { $regex: new RegExp(`^${assignedTo}$`, 'i') } }
          ]
        });
      }
      
      if (!assignedUser) {
        return res.status(404).json({
          success: false,
          message: `User "${assignedTo}" not found`
        });
      }
      
      // Only set assignActivity if this is actually a change
      if (!previouslyAssignedId || previouslyAssignedId !== assignedUser._id.toString()) {
        task.assignedTo = assignedUser._id;
        assignActivity = 'assigned_task';
      }
    }
    
    // Update the timestamp
    task.updatedAt = new Date();
    
    await task.save();
    
    // Log activity for the update
    try {
      // Standard update activity
      if (title !== undefined || description !== undefined || priority !== undefined || 
          dueDate !== undefined || status !== undefined) {
        await Activity.create({
          user: req.user.id,
          action: 'updated_task',
          taskId: task._id,
          boardId: task.board,
          columnId: task.column,
          teamId: task.team,
          description: `Updated task "${task.title}"`,
          metadata: {
            taskTitle: task.title,
            updatedFields: Object.keys(req.body).filter(k => k !== 'assignedTo' && k !== 'unassign')
          }
        });
      }
      
      // Assignment activity if needed
      if (assignActivity === 'assigned_task' && assignedUser) {
        await Activity.create({
          user: req.user.id,
          action: 'assigned_task',
          taskId: task._id,
          boardId: task.board,
          columnId: task.column,
          teamId: task.team,
          description: `Assigned task "${task.title}" to ${assignedUser.name || assignedUser.username}`,
          metadata: {
            taskTitle: task.title,
            assignedTo: assignedUser._id,
            assigneeName: assignedUser.name || assignedUser.username,
            previouslyAssigned: previouslyAssignedId
          }
        });
      } 
      else if (assignActivity === 'unassigned_task') {
        await Activity.create({
          user: req.user.id,
          action: 'unassigned_task',
          taskId: task._id,
          boardId: task.board,
          columnId: task.column,
          teamId: task.team,
          description: `Unassigned ${previousUser ? previousUser.name || previousUser.username : 'a user'} from task "${task.title}"`,
          metadata: {
            taskTitle: task.title,
            previouslyAssigned: previouslyAssignedId,
            previousUserName: previousUser ? previousUser.name || previousUser.username : undefined
          }
        });
      }
    } catch (activityError) {
      console.error('Activity logging error:', activityError);
      // Continue execution even if activity logging fails
    }
    
    // Get the fully populated task to return
    const populatedTask = await Task.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({
        path: 'board',
        select: 'title description'
      })
      .populate({
        path: 'column',
        select: 'name order'
      })
      .populate({
        path: 'team',
        select: 'name'
      });
    
    return res.status(200).json({
      success: true,
      message: 'Task updated successfully',
      data: {
        ...populatedTask._doc,
        isCompleted: populatedTask.status === 'done'
      }
    });
  } catch (error) {
    console.error('Update task error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating task',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Assign a task to a user - Express route handler
 */
const assignTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, email, username } = req.body;
    
    console.log('Assignment request:', { taskId: id, userId, email, username });
    
    // Allow flexible identification of the user to assign
    if (!userId && !email && !username) {
      return res.status(400).json({
        success: false,
        message: 'Please provide userId, email, or username to assign the task'
      });
    }
    
    // First, find the task
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    let assignedUser = null;
    
    // Attempt to find the user through multiple methods
    if (userId) {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        assignedUser = await User.findById(userId);
      } else {
        // If not a valid ObjectId, treat as a search term
        assignedUser = await User.findOne({
          $or: [
            { name: { $regex: new RegExp(userId, 'i') } },
            { username: { $regex: new RegExp(userId, 'i') } },
            { email: { $regex: new RegExp(userId, 'i') } }
          ]
        });
      }
    } else if (email) {
      assignedUser = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    } else if (username) {
      assignedUser = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    }
    
    if (!assignedUser) {
      const searchTerm = userId || email || username;
      return res.status(404).json({
        success: false,
        message: `Could not find user "${searchTerm}"`
      });
    }
    
    console.log('Found user to assign:', { 
      userId: assignedUser._id, 
      name: assignedUser.name || assignedUser.username,
      email: assignedUser.email 
    });
    
    // Store previous assignment for activity logging
    const wasAssignedTo = task.assignedTo;
    let previousUser = null;
    
    if (wasAssignedTo) {
      try {
        previousUser = await User.findById(wasAssignedTo).select('name username');
      } catch (err) {
        console.error('Error finding previous assignee:', err);
      }
    }
    
    // Update the task
    task.assignedTo = assignedUser._id;
    task.updatedAt = new Date();
    
    await task.save();
    
    // Fetch the fully populated task 
    const populatedTask = await Task.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({
        path: 'board',
        select: 'title description'
      })
      .populate({
        path: 'column',
        select: 'name order'
      })
      .populate({
        path: 'team',
        select: 'name'
      });
      
    // Log activity
    try {
      let actionDescription;
      
      if (wasAssignedTo) {
        actionDescription = `Reassigned task "${task.title}" from ${previousUser ? previousUser.name || previousUser.username : 'someone'} to ${assignedUser.name || assignedUser.username}`;
      } else {
        actionDescription = `Assigned task "${task.title}" to ${assignedUser.name || assignedUser.username}`;
      }
      
      await Activity.create({
        user: req.user.id,
        action: 'assigned_task',
        taskId: task._id,
        boardId: task.board,
        columnId: task.column,
        teamId: task.team,
        description: actionDescription,
        metadata: {
          taskTitle: task.title,
          assignedTo: assignedUser._id,
          assigneeName: assignedUser.name || assignedUser.username,
          previouslyAssigned: wasAssignedTo ? wasAssignedTo.toString() : null,
          previousUserName: previousUser ? previousUser.name || previousUser.username : null
        }
      });
      
      // Create notification for the assigned user
      await Notification.create({
        recipient: assignedUser._id,
        sender: req.user.id,
        type: 'task_assigned',
        relatedTask: task._id,
        relatedBoard: task.board,
        message: `You've been assigned to task "${task.title}"`,
        read: false
      });
      
    } catch (logError) {
      console.error('Activity or notification logging error:', logError);
    }
    
    return res.status(200).json({
      success: true,
      message: `Task ${wasAssignedTo ? 'reassigned' : 'assigned'} successfully`,
      data: {
        ...populatedTask._doc,
        isCompleted: populatedTask.status === 'done'
      }
    });
  } catch (error) {
    console.error('Assign task error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while assigning task',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Unassign a task - Express route handler
 */
const unassignTask = async (req, res) => {
  try {
    const { id } = req.params;
    
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // Check if task is already unassigned
    if (!task.assignedTo) {
      return res.status(200).json({
        success: true,
        message: 'Task is already unassigned',
        data: {
          ...task._doc,
          isCompleted: task.status === 'done'
        }
      });
    }
    
    // Store previous assignment for activity logging
    const previouslyAssignedId = task.assignedTo ? task.assignedTo.toString() : null;
    let previousUser = null;
    
    if (previouslyAssignedId) {
      try {
        previousUser = await User.findById(previouslyAssignedId).select('name username email');
      } catch (err) {
        console.error('Error finding previous assignee:', err);
      }
    }
    
    // Unassign the task
    task.assignedTo = null;
    task.updatedAt = new Date();
    
    await task.save();
    
    // Get the fully populated task
    const populatedTask = await Task.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email') // Will be null
      .populate('completedBy', 'name username avatar')
      .populate({
        path: 'board',
        select: 'title description'
      })
      .populate({
        path: 'column',
        select: 'name order'
      })
      .populate({
        path: 'team',
        select: 'name'
      });
    
    // Log activity
    if (previousUser) {
      try {
        await Activity.create({
          user: req.user.id,
          action: 'unassigned_task',
          taskId: task._id,
          boardId: task.board,
          columnId: task.column,
          teamId: task.team,
          description: `Unassigned ${previousUser.name || previousUser.username} from task "${task.title}"`,
          metadata: {
            taskTitle: task.title,
            previouslyAssigned: previouslyAssignedId,
            previousUserName: previousUser.name || previousUser.username || previousUser.email
          }
        });
        
        // Notify the previously assigned user if different from current user
        if (previouslyAssignedId !== req.user.id) {
          await Notification.create({
            recipient: previouslyAssignedId,
            sender: req.user.id,
            type: 'task_unassigned',
            relatedTask: task._id,
            relatedBoard: task.board,
            message: `You've been unassigned from task "${task.title}"`,
            read: false
          });
        }
      } catch (logError) {
        console.error('Activity or notification logging error:', logError);
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Task unassigned successfully',
      data: {
        ...populatedTask._doc,
        isCompleted: populatedTask.status === 'done',
        previousAssignee: previousUser ? {
          id: previousUser._id,
          name: previousUser.name || previousUser.username,
          email: previousUser.email
        } : null
      }
    });
  } catch (error) {
    console.error('Unassign task error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while unassigning task',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Complete a task
 */
const completeTask = async (req, res) => {
  try {
    const { id } = req.params;
    
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // Check if task is already completed
    if (task.status === 'done') {
      return res.status(400).json({
        success: false,
        message: 'Task is already completed'
      });
    }
    
    // Update task status to done
    task.status = 'done';
    task.completedBy = req.user.id;
    task.completedAt = new Date();
    task.updatedAt = new Date();
    
    await task.save();
    
    // Log activity
    try {
      await Activity.create({
        user: req.user.id,
        action: 'completed_task',
        taskId: task._id,
        boardId: task.board,
        columnId: task.column,
        description: `Completed task "${task.title}"`,
        metadata: {
          taskTitle: task.title,
          completedBy: req.user.id
        }
      });
    } catch (logError) {
      console.error('Activity logging error:', logError);
    }
    
    // Get updated task with populated fields
    const updatedTask = await Task.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({
        path: 'board',
        select: 'title description'
      })
      .populate({
        path: 'column',
        select: 'name order'
      })
      .populate({
        path: 'team',
        select: 'name'
      });
    
    return res.status(200).json({
      success: true,
      message: 'Task completed successfully',
      data: {
        ...updatedTask._doc,
        isCompleted: true
      }
    });
  } catch (error) {
    console.error('Complete task error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while completing task',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Reopen a completed task - enhanced version
 */
const reopenTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, moveToColumn } = req.body; // Optional parameters
    
    console.log(`Attempting to reopen task ${id}`);
    
    // Validate task exists
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // Store who completed it for activity logging
    const completedByUser = task.completedBy ? 
      await User.findById(task.completedBy).select('name username') : null;
    const completionDate = task.completedAt;
    
    // Check if task is already open
    if (task.status !== 'done') {
      return res.status(400).json({
        success: true, // Still return success to avoid client errors
        message: 'Task is already open',
        data: {
          ...task._doc,
          isCompleted: false
        }
      });
    }
    
    // Handle optional column move
    let originalColumn = task.column;
    if (moveToColumn) {
      // Verify column exists and belongs to the same board
      const targetColumn = await Column.findOne({
        _id: moveToColumn,
        board: task.board
      });
      
      if (targetColumn) {
        task.column = targetColumn._id;
        
        // Get position at the top of the column
        const firstTask = await Task.findOne({ column: targetColumn._id })
          .sort({ order: 1 })
          .limit(1);
        
        // Set order to be before the first task (or 0 if no tasks)
        task.order = firstTask ? Math.max(0, firstTask.order - 1) : 0;
      }
    }
    
    // Update task status to todo
    task.status = 'todo';
    task.completedBy = null;
    task.completedAt = null;
    task.updatedAt = new Date();
    
    await task.save();
    
    // Log activity with more detailed information
    try {
      let activityDescription = `Reopened task "${task.title}"`;
      
      if (completedByUser) {
        activityDescription += ` (previously completed by ${completedByUser.name || completedByUser.username})`;
      }
      
      if (reason) {
        activityDescription += ` - Reason: ${reason}`;
      }
      
      if (originalColumn.toString() !== task.column.toString()) {
        activityDescription += ` and moved it to a different column`;
      }
      
      await Activity.create({
        user: req.user.id,
        action: 'reopened_task',
        taskId: task._id,
        boardId: task.board,
        columnId: task.column,
        teamId: task.team,
        description: activityDescription,
        metadata: {
          taskTitle: task.title,
          reopenedBy: req.user.id,
          previouslyCompletedBy: task.completedBy ? task.completedBy.toString() : null,
          previouslyCompletedAt: completionDate,
          previouslyCompletedByName: completedByUser ? 
            completedByUser.name || completedByUser.username : null,
          reason: reason || null,
          movedFromColumn: originalColumn.toString() !== task.column.toString() ? 
            originalColumn.toString() : null,
          movedToColumn: originalColumn.toString() !== task.column.toString() ? 
            task.column.toString() : null
        }
      });
      
      // Notify the original task completer if it was someone else
      if (completedByUser && 
          completedByUser._id.toString() !== req.user.id &&
          completedByUser._id.toString() !== task.createdBy.toString()) {
        await Notification.create({
          recipient: completedByUser._id,
          sender: req.user.id,
          type: 'task_reopened',
          relatedTask: task._id,
          relatedBoard: task.board,
          message: `Task "${task.title}" that you completed has been reopened`,
          read: false
        });
      }
      
      // Also notify the creator if different from current user
      if (task.createdBy && task.createdBy.toString() !== req.user.id) {
        await Notification.create({
          recipient: task.createdBy,
          sender: req.user.id,
          type: 'task_reopened',
          relatedTask: task._id,
          relatedBoard: task.board,
          message: `Your task "${task.title}" has been reopened`,
          read: false
        });
      }
      
    } catch (logError) {
      console.error('Activity or notification error:', logError);
    }
    
    // Get updated task with populated fields
    const updatedTask = await Task.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({
        path: 'board',
        select: 'title description'
      })
      .populate({
        path: 'column',
        select: 'name order'
      })
      .populate({
        path: 'team',
        select: 'name'
      });
    
    // Generate appropriate message for the response
    let responseMessage = 'Task reopened successfully';
    if (originalColumn.toString() !== task.column.toString()) {
      responseMessage += ' and moved to a different column';
    }
    
    return res.status(200).json({
      success: true,
      message: responseMessage,
      data: {
        ...updatedTask._doc,
        isCompleted: false,
        previousState: {
          wasCompletedBy: completedByUser ? {
            id: completedByUser._id,
            name: completedByUser.name || completedByUser.username
          } : null,
          completedAt: completionDate
        }
      }
    });
  } catch (error) {
    console.error('Reopen task error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while reopening task',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get tasks by user ID
 */
const getTasksByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if valid user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }
    
    const userTasksFilter = {
      assignedTo: userId,
      ...(req.tenantId && { tenant: req.tenantId })
    };
    const tasks = await Task.find(userTasksFilter)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({
        path: 'board',
        select: 'title description'
      })
      .populate({
        path: 'column',
        select: 'name order'
      })
      .populate({
        path: 'team',
        select: 'name'
      })
      .sort({ updatedAt: -1 });
    
    return res.status(200).json({
      success: true,
      count: tasks.length,
      data: tasks.map(task => ({
        ...task._doc,
        isCompleted: task.status === 'done'
      }))
    });
  } catch (error) {
    console.error('Get tasks by user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching tasks',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get tasks by column ID
 */
const getTasksByColumn = async (req, res) => {
  try {
    const { columnId } = req.params;
    
    // Check if valid column ID
    if (!mongoose.Types.ObjectId.isValid(columnId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid column ID'
      });
    }
    
    const columnTasksFilter = {
      column: columnId,
      ...(req.tenantId && { tenant: req.tenantId })
    };
    const tasks = await Task.find(columnTasksFilter)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({
        path: 'board',
        select: 'title description'
      })
      .populate({
        path: 'column',
        select: 'name order'
      })
      .populate({
        path: 'team',
        select: 'name'
      })
      .sort({ order: 1 }); // Sort by task order within column
    
    return res.status(200).json({
      success: true,
      count: tasks.length,
      data: tasks.map(task => ({
        ...task._doc,
        isCompleted: task.status === 'done'
      }))
    });
  } catch (error) {
    console.error('Get tasks by column error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching tasks',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete a task - improved version
 */
const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Attempting to delete task ${id}`);
    
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // Store task info for activity log before deletion
    const taskInfo = {
      title: task.title,
      boardId: task.board?.toString(),
      columnId: task.column?.toString(),
      teamId: task.team?.toString()
    };
    
    console.log('Found task to delete:', {
      id: task._id,
      title: task.title,
      board: task.board,
      column: task.column
    });
    
    // Simplified permission check - always allow task deletion
    // This simplification should be replaced with proper permission logic in production
    
    try {
      // Delete the task first
      const deleteResult = await Task.deleteOne({ _id: id });
      
      if (deleteResult.deletedCount !== 1) {
        console.error('Task deletion failed:', deleteResult);
        return res.status(500).json({
          success: false,
          message: 'Failed to delete task'
        });
      }
      
      console.log('Task deleted successfully:', { id, deleteResult });
      
      // Log activity after successful deletion
      try {
        await Activity.create({
          user: req.user.id,
          action: 'deleted_task',
          boardId: taskInfo.boardId,
          columnId: taskInfo.columnId,
          teamId: taskInfo.teamId,
          description: `Deleted task "${taskInfo.title}"`,
          metadata: {
            taskTitle: taskInfo.title,
            taskId: id
          }
        });
      } catch (activityError) {
        console.error('Failed to log task deletion activity:', activityError);
        // Continue even if activity logging fails
      }
      
      return res.status(200).json({
        success: true,
        message: 'Task deleted successfully'
      });
    } catch (deleteError) {
      console.error('Error during task deletion:', deleteError);
      return res.status(500).json({
        success: false,
        message: 'Server error while deleting task',
        error: process.env.NODE_ENV === 'development' ? deleteError.message : undefined
      });
    }
  } catch (error) {
    console.error('Delete task error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting task',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createTask,
  createTaskFromBody,
  getAllTasks,
  getTaskById,
  moveTask,
  updateTask,
  assignTask,
  unassignTask,
  completeTask,
  reopenTask,
  getTasksByUser,
  getTasksByColumn,
  deleteTask
};
