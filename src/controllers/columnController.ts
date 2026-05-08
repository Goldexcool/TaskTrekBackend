import { Request, Response } from 'express';
import Column from '../models/Column';
import Board from '../models/Board';
import Task from '../models/Task';
import Activity from '../models/Activity';
import Team from '../models/Team';
import { IBoardDocument } from '../models/Board';

/**
 * Helper function to check if a user has edit permission on a board
 */
const checkBoardEditPermission = async (
  board: IBoardDocument,
  userId: string
): Promise<boolean> => {
  if (!board || !userId) return false;

  if (board.createdBy.toString() === userId) return true;

  const memberEntry = board.members.find(member => member.user.toString() === userId);

  if (memberEntry && (memberEntry.role === 'admin' || memberEntry.role === 'member')) {
    return true;
  }

  if (board.team) {
    const team = await Team.findById(board.team);
    if (team) {
      if (team.owner.toString() === userId) return true;
      if (team.admins && team.admins.map(a => a.toString()).includes(userId)) return true;
    }
  }

  return false;
};

/**
 * Add a new column to a board
 * @route POST /api/boards/:boardId/columns
 */
const addColumn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { boardId } = req.params;
    const { name } = req.body as { name?: string };

    if (!name) {
      res.status(400).json({ success: false, message: 'Column name is required' });
      return;
    }

    const board = await Board.findById(boardId);
    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    const hasPermission = await checkBoardEditPermission(board, req.user!.id);
    if (!hasPermission) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to add columns to this board'
      });
      return;
    }

    const maxOrderColumn = await Column.findOne({ board: boardId })
      .sort({ position: -1 })
      .limit(1);

    const newOrder = maxOrderColumn ? maxOrderColumn.position + 1 : 0;

    const column = await Column.create({ title: name, position: newOrder, board: boardId });

    try {
      await Activity.create({
        user: req.user!.id,
        action: 'created_board',
        boardId,
        columnId: column._id,
        metadata: { columnName: name }
      });
    } catch (actErr) {
      console.error('Activity log error:', actErr);
    }

    const boardWithMembers = await Board.findById(boardId).populate({
      path: 'members.user',
      select: '_id'
    });

    const io = req.app.get('io') as {
      to(room: string): { emit(event: string, data: unknown): void };
    } | undefined;

    if (io && boardWithMembers && boardWithMembers.members) {
      const memberIds = boardWithMembers.members
        .map(member => (member.user as unknown as { _id: { toString(): string } })._id.toString())
        .filter(id => id !== req.user!.id);

      memberIds.forEach(memberId => {
        io.to(`user:${memberId}`).emit('column:created', {
          boardId,
          column: { _id: column._id, name: column.title, order: column.position },
          creator: { id: req.user!.id }
        });
      });
    }

    res.status(201).json({ success: true, message: 'Column added successfully', data: column });
  } catch (error) {
    console.error('Add column error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding column',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * Update column details
 * @route PUT /api/columns/:id
 */
const updateColumn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, order } = req.body as { name?: string; order?: number };

    const column = await Column.findById(id);
    if (!column) {
      res.status(404).json({ success: false, message: 'Column not found' });
      return;
    }

    const board = await Board.findById(column.board);
    if (!board) {
      res.status(404).json({ success: false, message: 'Associated board not found' });
      return;
    }

    const hasPermission = await checkBoardEditPermission(board, req.user!.id);
    if (!hasPermission) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to update this column'
      });
      return;
    }

    const oldName = column.title;

    if (name !== undefined) column.title = name;
    if (order !== undefined) column.position = order;

    await column.save();

    if (name && name !== oldName) {
      try {
        await Activity.create({
          user: req.user!.id,
          action: 'updated_board',
          boardId: column.board,
          columnId: column._id,
          metadata: { oldName, newName: name }
        });
      } catch (actErr) {
        console.error('Activity log error:', actErr);
      }
    }

    const io = req.app.get('io') as {
      to(room: string): { emit(event: string, data: unknown): void };
    } | undefined;

    if (io && board.members) {
      const memberIds = board.members
        .map(member => member.user.toString())
        .filter(id => id !== req.user!.id);

      memberIds.forEach(memberId => {
        io.to(`user:${memberId}`).emit('column:updated', {
          boardId: board._id,
          column: { _id: column._id, name: column.title, order: column.position },
          updater: { id: req.user!.id }
        });
      });
    }

    res.status(200).json({ success: true, message: 'Column updated successfully', data: column });
  } catch (error) {
    console.error('Update column error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating column',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * Delete a column and its tasks
 * @route DELETE /api/columns/:id
 */
const deleteColumn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { moveTasks, destinationColumnId } = req.body as {
      moveTasks?: boolean;
      destinationColumnId?: string;
    };

    const column = await Column.findById(id);
    if (!column) {
      res.status(404).json({ success: false, message: 'Column not found' });
      return;
    }

    const board = await Board.findById(column.board);
    if (!board) {
      res.status(404).json({ success: false, message: 'Associated board not found' });
      return;
    }

    const hasPermission = await checkBoardEditPermission(board, req.user!.id);
    if (!hasPermission) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this column'
      });
      return;
    }

    if (moveTasks && destinationColumnId) {
      const destinationColumn = await Column.findOne({
        _id: destinationColumnId,
        board: column.board
      });

      if (!destinationColumn) {
        res.status(400).json({
          success: false,
          message: 'Destination column not found in this board'
        });
        return;
      }

      await Task.updateMany({ column: column._id }, { column: destinationColumnId });
    } else {
      await Task.deleteMany({ column: column._id });
    }

    await column.deleteOne();

    try {
      await Activity.create({
        user: req.user!.id,
        action: 'deleted_board',
        boardId: column.board,
        metadata: {
          columnName: column.title,
          tasksPreserved: moveTasks ? true : false,
          destinationColumn: moveTasks ? destinationColumnId : null
        }
      });
    } catch (actErr) {
      console.error('Activity log error:', actErr);
    }

    const io = req.app.get('io') as {
      to(room: string): { emit(event: string, data: unknown): void };
    } | undefined;

    if (io && board.members) {
      const memberIds = board.members
        .map(member => member.user.toString())
        .filter(id => id !== req.user!.id);

      memberIds.forEach(memberId => {
        io.to(`user:${memberId}`).emit('column:deleted', {
          boardId: board._id,
          columnId: column._id,
          tasks: { moved: !!moveTasks, destinationColumnId: destinationColumnId || null },
          deleter: { id: req.user!.id }
        });
      });
    }

    res.status(200).json({ success: true, message: 'Column deleted successfully' });
  } catch (error) {
    console.error('Delete column error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting column',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

const createColumn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, boardId, position } = req.body as {
      title?: string;
      boardId?: string;
      position?: number;
    };

    if (!title || !boardId) {
      res.status(400).json({ success: false, message: 'Please provide title and boardId' });
      return;
    }

    const column = await Column.create({ title, board: boardId, position: position || 0 });

    res.status(201).json({ success: true, data: column });
  } catch (error) {
    console.error('Column creation error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

const getColumnsByBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const boardId = req.params.boardId;
    console.log('Getting columns for board:', boardId);

    const columns = await Column.find({ board: boardId }).sort({ position: 1 });

    console.log(`Found ${columns.length} columns`);

    res.status(200).json({ success: true, count: columns.length, data: columns });
  } catch (error) {
    console.error('Get columns error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

export { createColumn, getColumnsByBoard, addColumn, updateColumn, deleteColumn };
