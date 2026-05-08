import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Task from '../models/Task';
import Column from '../models/Column';
import Board from '../models/Board';
import User from '../models/User';
import Activity from '../models/Activity';
import Notification from '../models/Notification';

/**
 * Create a task from board/column route
 */
const createTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { boardId, columnId } = req.params;
    const {
      title,
      description,
      priority = 'medium',
      dueDate,
      assignedTo
    } = req.body as {
      title?: string;
      description?: string;
      priority?: string;
      dueDate?: string;
      assignedTo?: string;
    };

    if (!title) {
      res.status(400).json({ success: false, message: 'Task title is required' });
      return;
    }

    const board = await Board.findById(boardId);
    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    const column = await Column.findOne({ _id: columnId, board: boardId });
    if (!column) {
      res.status(404).json({ success: false, message: 'Column not found in this board' });
      return;
    }

    const maxOrderTask = await Task.findOne({ column: columnId }).sort({ order: -1 }).limit(1);
    const order = maxOrderTask ? maxOrderTask.order + 1 : 0;

    let taskAssignee: mongoose.Types.ObjectId | null = null;

    if (assignedTo) {
      if (!mongoose.isValidObjectId(assignedTo)) {
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
          res.status(400).json({ success: false, message: `Could not find user "${assignedTo}"` });
          return;
        }
      } else {
        taskAssignee = (new (mongoose.Types.ObjectId as unknown as new (id: string) => mongoose.Types.ObjectId)(assignedTo));
      }
    }

    const task = await Task.create({
      title,
      description: description || '',
      priority: priority || 'medium',
      dueDate,
      assignedTo: taskAssignee,
      createdBy: req.user!.id,
      board: boardId,
      column: columnId,
      order,
      team: board.team,
      ...(req.tenantId && { tenant: req.tenantId })
    });

    const populatedTask = await Task.findById(task._id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate({ path: 'board', select: 'title description' })
      .populate({ path: 'column', select: 'title position' })
      .populate({ path: 'team', select: 'name' });

    try {
      await Activity.create({
        user: req.user!.id,
        action: 'created_task',
        taskId: task._id,
        boardId,
        columnId,
        teamId: board.team,
        description: `Created task "${task.title}"`,
        metadata: { taskTitle: title, priority, assignedTo: taskAssignee }
      });
    } catch (activityError) {
      console.error('Activity logging error:', activityError);
    }

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: { ...((populatedTask as unknown as { toObject(): Record<string, unknown> }).toObject()), isCompleted: false }
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating task',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * Create a task (client-friendly version that accepts columnId in body)
 */
const createTaskFromBody = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title,
      columnId,
      position,
      description,
      priority,
      dueDate,
      assignedTo
    } = req.body as {
      title?: string;
      columnId?: string;
      position?: number;
      description?: string;
      priority?: string;
      dueDate?: string;
      assignedTo?: string;
    };

    if (!columnId || !title) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: columnId and title are required'
      });
      return;
    }

    const column = await Column.findById(columnId);
    if (!column) {
      res.status(404).json({ success: false, message: 'Column not found' });
      return;
    }

    const boardId = column.board;

    const board = await Board.findById(boardId);
    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    let taskAssignee: mongoose.Types.ObjectId | null = null;

    if (assignedTo) {
      if (!mongoose.isValidObjectId(assignedTo)) {
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
          res.status(400).json({ success: false, message: `Could not find user "${assignedTo}"` });
          return;
        }
      } else {
        taskAssignee = (new (mongoose.Types.ObjectId as unknown as new (id: string) => mongoose.Types.ObjectId)(assignedTo));
      }
    }

    let order = position;
    if (order === undefined) {
      const maxOrderTask = await Task.findOne({ column: columnId }).sort({ order: -1 }).limit(1);
      order = maxOrderTask ? maxOrderTask.order + 1 : 0;
    }

    const task = await Task.create({
      title,
      description: description || '',
      priority: priority || 'medium',
      dueDate,
      assignedTo: taskAssignee,
      createdBy: req.user!.id,
      board: boardId,
      column: columnId,
      order,
      team: board.team,
      ...(req.tenantId && { tenant: req.tenantId })
    });

    const populatedTask = await Task.findById(task._id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate({ path: 'board', select: 'title description' })
      .populate({ path: 'column', select: 'title position' })
      .populate({ path: 'team', select: 'name' });

    try {
      await Activity.create({
        user: req.user!.id,
        action: 'created_task',
        taskId: task._id,
        boardId,
        columnId,
        teamId: board.team,
        description: `Created task "${task.title}"`,
        metadata: { taskTitle: title, priority, assignedTo: taskAssignee }
      });
    } catch (activityError) {
      console.error('Activity logging error:', activityError);
    }

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: { ...((populatedTask as unknown as { toObject(): Record<string, unknown> }).toObject()), isCompleted: false }
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating task',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

const getAllTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const allTasksFilter = req.tenantId ? { tenant: req.tenantId } : {};
    const tasks = await Task.find(allTasksFilter)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({ path: 'board', select: 'title description' })
      .populate({ path: 'column', select: 'title position' })
      .populate({ path: 'team', select: 'name' })
      .sort({ updatedAt: -1 });

    const tasksWithStatus = tasks.map(task => ({
      ...((task as unknown as { toObject(): Record<string, unknown> }).toObject()),
      isCompleted: task.status === 'done'
    }));

    res.status(200).json({ success: true, count: tasksWithStatus.length, data: tasksWithStatus });
  } catch (error) {
    console.error('Get all tasks error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching tasks',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

const getTaskById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (id === 'all') {
      return getAllTasks(req, res);
    }

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid task ID format' });
      return;
    }

    const task = await Task.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({ path: 'board', select: 'title description createdBy members team' })
      .populate({ path: 'column', select: 'title position' });

    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: { ...((task as unknown as { toObject(): Record<string, unknown> }).toObject()), isCompleted: task.status === 'done' }
    });
  } catch (error) {
    console.error('Get task by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching task',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * Move a task between columns or change order
 */
const moveTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { destinationColumnId, order } = req.body as {
      destinationColumnId?: string;
      order?: number;
    };

    if (destinationColumnId === undefined && order === undefined) {
      res.status(400).json({
        success: false,
        message: 'Either destinationColumnId or order is required'
      });
      return;
    }

    const task = await Task.findById(id);
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    const originalColumnId = task.column;
    const originalOrder = task.order;

    if (destinationColumnId) {
      const destinationColumn = await Column.findOne({ _id: destinationColumnId, board: task.board });

      if (!destinationColumn) {
        res.status(400).json({
          success: false,
          message: 'Destination column not found in this board'
        });
        return;
      }

      task.column = (new (mongoose.Types.ObjectId as unknown as new (id: string) => mongoose.Types.ObjectId)(destinationColumnId));
    }

    if (order !== undefined) {
      task.order = order;
    }

    task.updatedAt = new Date();
    await task.save();

    try {
      await Activity.create({
        user: req.user!.id,
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
    } catch (actErr) {
      console.error('Activity log error:', actErr);
    }

    res.status(200).json({ success: true, message: 'Task moved successfully', data: task });
  } catch (error) {
    console.error('Move task error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while moving task',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * Update a task
 */
const updateTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, priority, dueDate, status, assignedTo, unassign } = req.body as {
      title?: string;
      description?: string;
      priority?: string;
      dueDate?: string;
      status?: string;
      assignedTo?: string;
      unassign?: boolean;
    };

    console.log(`Updating task ${id}`, req.body);

    const task = await Task.findById(id);

    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    const previouslyAssignedId = task.assignedTo ? task.assignedTo.toString() : null;
    let previousUser: { name: string; username: string } | null = null;

    if (previouslyAssignedId) {
      try {
        previousUser = await User.findById(previouslyAssignedId).select('name username').lean() as { name: string; username: string } | null;
      } catch (userError) {
        console.error('Error finding previous user:', userError);
      }
    }

    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (priority !== undefined) task.priority = priority as 'low' | 'medium' | 'high' | 'critical';
    if (dueDate !== undefined) task.dueDate = new Date(dueDate);
    if (status !== undefined) {
      const statusMap: Record<string, 'todo' | 'in_progress' | 'done'> = {
        completed: 'done',
        complete: 'done',
        finished: 'done',
        done: 'done',
        pending: 'todo',
        'in-progress': 'todo',
        inprogress: 'todo',
        'in progress': 'todo',
        todo: 'todo'
      };
      const statusLower = status.toLowerCase();
      task.status = statusMap[statusLower] || 'todo';
    }

    let assignActivity: string | null = null;
    let assignedUser: { _id: mongoose.Types.ObjectId; name: string; username: string } | null = null;

    if (unassign === true) {
      task.assignedTo = null;
      assignActivity = 'unassigned_task';
    } else if (assignedTo) {
      if (mongoose.isValidObjectId(assignedTo)) {
        assignedUser = await User.findById(assignedTo).lean() as unknown as { _id: import("mongoose").Types.ObjectId; name: string; username: string; email: string } | null;
      } else {
        assignedUser = await User.findOne({
          $or: [
            { name: { $regex: new RegExp(`^${assignedTo}$`, 'i') } },
            { username: { $regex: new RegExp(`^${assignedTo}$`, 'i') } },
            { email: { $regex: new RegExp(`^${assignedTo}$`, 'i') } }
          ]
        }).lean() as unknown as { _id: import("mongoose").Types.ObjectId; name: string; username: string; email: string } | null;
      }

      if (!assignedUser) {
        res.status(404).json({ success: false, message: `User "${assignedTo}" not found` });
        return;
      }

      if (!previouslyAssignedId || previouslyAssignedId !== assignedUser._id.toString()) {
        task.assignedTo = assignedUser._id;
        assignActivity = 'assigned_task';
      }
    }

    task.updatedAt = new Date();

    await task.save();

    try {
      if (
        title !== undefined ||
        description !== undefined ||
        priority !== undefined ||
        dueDate !== undefined ||
        status !== undefined
      ) {
        await Activity.create({
          user: req.user!.id,
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
    } catch (activityError) {
      console.error('Activity logging error:', activityError);
    }

    const populatedTask = await Task.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({ path: 'board', select: 'title description' })
      .populate({ path: 'column', select: 'title position' })
      .populate({ path: 'team', select: 'name' });

    res.status(200).json({
      success: true,
      message: 'Task updated successfully',
      data: {
        ...((populatedTask as unknown as { toObject(): Record<string, unknown> }).toObject()),
        isCompleted: populatedTask!.status === 'done'
      }
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating task',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * Assign a task to a user
 */
const assignTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { userId, email, username } = req.body as {
      userId?: string;
      email?: string;
      username?: string;
    };

    console.log('Assignment request:', { taskId: id, userId, email, username });

    if (!userId && !email && !username) {
      res.status(400).json({
        success: false,
        message: 'Please provide userId, email, or username to assign the task'
      });
      return;
    }

    const task = await Task.findById(id);
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    let assignedUser: { _id: mongoose.Types.ObjectId; name: string; username: string; email: string } | null = null;

    if (userId) {
      if (mongoose.isValidObjectId(userId)) {
        assignedUser = await User.findById(userId).lean() as unknown as { _id: import("mongoose").Types.ObjectId; name: string; username: string; email: string } | null;
      } else {
        assignedUser = await User.findOne({
          $or: [
            { name: { $regex: new RegExp(userId, 'i') } },
            { username: { $regex: new RegExp(userId, 'i') } },
            { email: { $regex: new RegExp(userId, 'i') } }
          ]
        }).lean() as unknown as { _id: import("mongoose").Types.ObjectId; name: string; username: string; email: string } | null;
      }
    } else if (email) {
      assignedUser = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } }).lean() as unknown as { _id: import("mongoose").Types.ObjectId; name: string; username: string; email: string } | null;
    } else if (username) {
      assignedUser = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } }).lean() as unknown as { _id: import("mongoose").Types.ObjectId; name: string; username: string; email: string } | null;
    }

    if (!assignedUser) {
      const searchTerm = userId || email || username;
      res.status(404).json({ success: false, message: `Could not find user "${searchTerm}"` });
      return;
    }

    const wasAssignedTo = task.assignedTo;
    let previousUser: { _id: mongoose.Types.ObjectId; name: string; username: string } | null = null;

    if (wasAssignedTo) {
      try {
        previousUser = await User.findById(wasAssignedTo).select('name username').lean() as unknown as { _id: import("mongoose").Types.ObjectId; name: string; username: string; email: string } | null;
      } catch (err) {
        console.error('Error finding previous assignee:', err);
      }
    }

    task.assignedTo = assignedUser._id;
    task.updatedAt = new Date();

    await task.save();

    const populatedTask = await Task.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({ path: 'board', select: 'title description' })
      .populate({ path: 'column', select: 'title position' })
      .populate({ path: 'team', select: 'name' });

    try {
      const actionDescription = wasAssignedTo
        ? `Reassigned task "${task.title}" from ${previousUser ? previousUser.name || previousUser.username : 'someone'} to ${assignedUser.name || assignedUser.username}`
        : `Assigned task "${task.title}" to ${assignedUser.name || assignedUser.username}`;

      await Activity.create({
        user: req.user!.id,
        action: 'updated_task',
        taskId: task._id,
        boardId: task.board,
        columnId: task.column,
        teamId: task.team,
        description: actionDescription,
        metadata: {
          taskTitle: task.title,
          assignedTo: assignedUser._id,
          assigneeName: assignedUser.name || assignedUser.username,
          previouslyAssigned: wasAssignedTo ? wasAssignedTo.toString() : null
        }
      });

      await Notification.create({
        recipient: assignedUser._id,
        type: 'task_assigned',
        relatedTask: task._id,
        relatedBoard: task.board,
        message: `You've been assigned to task "${task.title}"`,
        read: false
      });
    } catch (logError) {
      console.error('Activity or notification logging error:', logError);
    }

    res.status(200).json({
      success: true,
      message: `Task ${wasAssignedTo ? 'reassigned' : 'assigned'} successfully`,
      data: {
        ...((populatedTask as unknown as { toObject(): Record<string, unknown> }).toObject()),
        isCompleted: populatedTask!.status === 'done'
      }
    });
  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while assigning task',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * Unassign a task
 */
const unassignTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const task = await Task.findById(id);
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    if (!task.assignedTo) {
      res.status(200).json({
        success: true,
        message: 'Task is already unassigned',
        data: { ...((task as unknown as { toObject(): Record<string, unknown> }).toObject()), isCompleted: task.status === 'done' }
      });
      return;
    }

    const previouslyAssignedId = task.assignedTo.toString();
    let previousUser: { _id: mongoose.Types.ObjectId; name: string; username: string; email: string } | null = null;

    try {
      previousUser = await User.findById(previouslyAssignedId).select('name username email').lean() as unknown as { _id: import("mongoose").Types.ObjectId; name: string; username: string; email: string } | null;
    } catch (err) {
      console.error('Error finding previous assignee:', err);
    }

    task.assignedTo = null;
    task.updatedAt = new Date();

    await task.save();

    const populatedTask = await Task.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({ path: 'board', select: 'title description' })
      .populate({ path: 'column', select: 'title position' })
      .populate({ path: 'team', select: 'name' });

    if (previousUser) {
      try {
        await Activity.create({
          user: req.user!.id,
          action: 'updated_task',
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

        if (previouslyAssignedId !== req.user!.id) {
          await Notification.create({
            recipient: previouslyAssignedId,
            type: 'task_assigned',
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

    res.status(200).json({
      success: true,
      message: 'Task unassigned successfully',
      data: {
        ...((populatedTask as unknown as { toObject(): Record<string, unknown> }).toObject()),
        isCompleted: populatedTask!.status === 'done',
        previousAssignee: previousUser
          ? { id: previousUser._id, name: previousUser.name || previousUser.username, email: previousUser.email }
          : null
      }
    });
  } catch (error) {
    console.error('Unassign task error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while unassigning task',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * Complete a task
 */
const completeTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const task = await Task.findById(id);
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    if (task.status === 'done') {
      res.status(400).json({ success: false, message: 'Task is already completed' });
      return;
    }

    task.status = 'done';
    task.completedBy = (new (mongoose.Types.ObjectId as unknown as new (id: string) => mongoose.Types.ObjectId)(req.user!.id));
    task.completedAt = new Date();
    task.updatedAt = new Date();

    await task.save();

    try {
      await Activity.create({
        user: req.user!.id,
        action: 'updated_task',
        taskId: task._id,
        boardId: task.board,
        columnId: task.column,
        description: `Completed task "${task.title}"`,
        metadata: { taskTitle: task.title, completedBy: req.user!.id }
      });
    } catch (logError) {
      console.error('Activity logging error:', logError);
    }

    const updatedTask = await Task.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({ path: 'board', select: 'title description' })
      .populate({ path: 'column', select: 'title position' })
      .populate({ path: 'team', select: 'name' });

    res.status(200).json({
      success: true,
      message: 'Task completed successfully',
      data: { ...((updatedTask as unknown as { toObject(): Record<string, unknown> }).toObject()), isCompleted: true }
    });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while completing task',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * Reopen a completed task
 */
const reopenTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason, moveToColumn } = req.body as { reason?: string; moveToColumn?: string };

    console.log(`Attempting to reopen task ${id}`);

    const task = await Task.findById(id);
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    const completedByUser = task.completedBy
      ? await User.findById(task.completedBy).select('name username').lean() as { _id: mongoose.Types.ObjectId; name: string; username: string } | null
      : null;
    const completionDate = task.completedAt;

    if (task.status !== 'done') {
      res.status(400).json({
        success: true,
        message: 'Task is already open',
        data: { ...((task as unknown as { toObject(): Record<string, unknown> }).toObject()), isCompleted: false }
      });
      return;
    }

    const originalColumn = task.column;
    if (moveToColumn) {
      const targetColumn = await Column.findOne({ _id: moveToColumn, board: task.board });

      if (targetColumn) {
        task.column = targetColumn._id;

        const firstTask = await Task.findOne({ column: targetColumn._id }).sort({ order: 1 }).limit(1);
        task.order = firstTask ? Math.max(0, firstTask.order - 1) : 0;
      }
    }

    task.status = 'todo';
    task.completedBy = null;
    task.completedAt = null;
    task.updatedAt = new Date();

    await task.save();

    try {
      let activityDescription = `Reopened task "${task.title}"`;
      if (completedByUser) {
        activityDescription += ` (previously completed by ${completedByUser.name || completedByUser.username})`;
      }
      if (reason) {
        activityDescription += ` - Reason: ${reason}`;
      }

      await Activity.create({
        user: req.user!.id,
        action: 'updated_task',
        taskId: task._id,
        boardId: task.board,
        columnId: task.column,
        teamId: task.team,
        description: activityDescription,
        metadata: {
          taskTitle: task.title,
          reopenedBy: req.user!.id,
          previouslyCompletedAt: completionDate,
          reason: reason || null
        }
      });

      if (
        completedByUser &&
        completedByUser._id.toString() !== req.user!.id &&
        completedByUser._id.toString() !== task.createdBy.toString()
      ) {
        await Notification.create({
          recipient: completedByUser._id,
          type: 'task_reopened',
          relatedTask: task._id,
          relatedBoard: task.board,
          message: `Task "${task.title}" that you completed has been reopened`,
          read: false
        });
      }

      if (task.createdBy && task.createdBy.toString() !== req.user!.id) {
        await Notification.create({
          recipient: task.createdBy,
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

    const updatedTask = await Task.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({ path: 'board', select: 'title description' })
      .populate({ path: 'column', select: 'title position' })
      .populate({ path: 'team', select: 'name' });

    let responseMessage = 'Task reopened successfully';
    if (originalColumn.toString() !== task.column.toString()) {
      responseMessage += ' and moved to a different column';
    }

    res.status(200).json({
      success: true,
      message: responseMessage,
      data: {
        ...((updatedTask as unknown as { toObject(): Record<string, unknown> }).toObject()),
        isCompleted: false,
        previousState: {
          wasCompletedBy: completedByUser
            ? { id: completedByUser._id, name: completedByUser.name || completedByUser.username }
            : null,
          completedAt: completionDate
        }
      }
    });
  } catch (error) {
    console.error('Reopen task error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while reopening task',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * Get tasks by user ID
 */
const getTasksByUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      res.status(400).json({ success: false, message: 'Invalid user ID' });
      return;
    }

    const userTasksFilter: Record<string, unknown> = {
      assignedTo: userId,
      ...(req.tenantId && { tenant: req.tenantId })
    };
    const tasks = await Task.find(userTasksFilter)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({ path: 'board', select: 'title description' })
      .populate({ path: 'column', select: 'title position' })
      .populate({ path: 'team', select: 'name' })
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: tasks.length,
      data: tasks.map(task => ({
        ...((task as unknown as { toObject(): Record<string, unknown> }).toObject()),
        isCompleted: task.status === 'done'
      }))
    });
  } catch (error) {
    console.error('Get tasks by user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching tasks',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * Get tasks by column ID
 */
const getTasksByColumn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { columnId } = req.params;

    if (!mongoose.isValidObjectId(columnId)) {
      res.status(400).json({ success: false, message: 'Invalid column ID' });
      return;
    }

    const columnTasksFilter: Record<string, unknown> = {
      column: columnId,
      ...(req.tenantId && { tenant: req.tenantId })
    };
    const tasks = await Task.find(columnTasksFilter)
      .populate('createdBy', 'name username avatar')
      .populate('assignedTo', 'name username avatar email')
      .populate('completedBy', 'name username avatar')
      .populate({ path: 'board', select: 'title description' })
      .populate({ path: 'column', select: 'title position' })
      .populate({ path: 'team', select: 'name' })
      .sort({ order: 1 });

    res.status(200).json({
      success: true,
      count: tasks.length,
      data: tasks.map(task => ({
        ...((task as unknown as { toObject(): Record<string, unknown> }).toObject()),
        isCompleted: task.status === 'done'
      }))
    });
  } catch (error) {
    console.error('Get tasks by column error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching tasks',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * Delete a task
 */
const deleteTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    console.log(`Attempting to delete task ${id}`);

    const task = await Task.findById(id);
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    const taskInfo = {
      title: task.title,
      boardId: task.board?.toString(),
      columnId: task.column?.toString(),
      teamId: task.team?.toString()
    };

    try {
      const deleteResult = await Task.deleteOne({ _id: id });

      if (deleteResult.deletedCount !== 1) {
        console.error('Task deletion failed:', deleteResult);
        res.status(500).json({ success: false, message: 'Failed to delete task' });
        return;
      }

      console.log('Task deleted successfully:', { id, deleteResult });

      try {
        await Activity.create({
          user: req.user!.id,
          action: 'deleted_task',
          boardId: taskInfo.boardId,
          columnId: taskInfo.columnId,
          teamId: taskInfo.teamId,
          description: `Deleted task "${taskInfo.title}"`,
          metadata: { taskTitle: taskInfo.title, taskId: id }
        });
      } catch (activityError) {
        console.error('Failed to log task deletion activity:', activityError);
      }

      res.status(200).json({ success: true, message: 'Task deleted successfully' });
    } catch (deleteError) {
      console.error('Error during task deletion:', deleteError);
      res.status(500).json({
        success: false,
        message: 'Server error while deleting task',
        error:
          process.env.NODE_ENV === 'development' ? (deleteError as Error).message : undefined
      });
    }
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting task',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

export {
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
