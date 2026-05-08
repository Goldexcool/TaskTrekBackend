import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Board from '../models/Board';
import Team from '../models/Team';
import Column from '../models/Column';
import Task from '../models/Task';
import User from '../models/User';
import Activity from '../models/Activity';

/**
 * Create a new board
 */
const createBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, teamId } = req.body as {
      title?: string;
      description?: string;
      teamId?: string;
    };

    if (!title) {
      res.status(400).json({ success: false, message: 'Board title is required' });
      return;
    }

    const board = await Board.create({
      title,
      description: description || '',
      team: teamId || null,
      createdBy: req.user!.id,
      members: [{ user: req.user!.id, role: 'admin' }],
      ...(req.tenantId && { tenant: req.tenantId })
    });

    const defaultColumns = [
      { title: 'To Do', board: board._id, position: 0 },
      { title: 'In Progress', board: board._id, position: 1 },
      { title: 'Done', board: board._id, position: 2 }
    ];

    await Column.insertMany(defaultColumns);

    const populatedBoard = await Board.findById(board._id)
      .populate('createdBy', 'name username avatar')
      .populate('members.user', 'name username avatar email')
      .populate('team', 'name');

    const columns = await Column.find({ board: board._id }).sort('position');

    await Activity.create({
      user: req.user!.id,
      action: 'created_board',
      boardId: board._id,
      teamId: teamId || null,
      description: `Created board "${title}"`,
      metadata: { boardTitle: title }
    });

    res.status(201).json({
      success: true,
      message: 'Board created successfully',
      data: {
        ...((populatedBoard as unknown as { toObject(): Record<string, unknown> }).toObject()),
        columns
      }
    });
  } catch (error) {
    console.error('Create board error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating board',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// Get all boards
const getBoards = async (req: Request, res: Response): Promise<void> => {
  try {
    const boardFilter: Record<string, unknown> = {
      $or: [{ createdBy: req.user!.id }, { 'members.user': req.user!.id }],
      ...(req.tenantId && { tenant: req.tenantId })
    };
    const boards = await Board.find(boardFilter)
      .populate('team', 'name')
      .populate('createdBy', 'username email')
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, count: boards.length, data: boards });
  } catch (error) {
    console.error('Error getting boards:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// Get board by ID
const getBoardById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid board ID format' });
      return;
    }

    console.log(`Getting board with ID: ${id} for user ${userId}`);

    const boardExists = await Board.exists({ _id: id });
    if (!boardExists) {
      console.log(`Board with ID ${id} does not exist in the database`);
      res.status(404).json({ success: false, message: 'Board not found in database' });
      return;
    }

    const board = await Board.findOne({ _id: id, deleted: { $ne: true } })
      .populate('createdBy', 'name username avatar')
      .populate('members.user', 'name username avatar email')
      .populate('team', 'name');

    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    const createdByDoc = board.createdBy as unknown as { _id: { toString(): string } } | null;
    const isCreator = createdByDoc && createdByDoc._id.toString() === userId;
    const isBoardMember =
      board.members &&
      board.members.some(m => {
        const memberUser = m.user as unknown as { _id?: { toString(): string } } | { toString(): string };
        const id_ = (memberUser as { _id?: { toString(): string } })._id || memberUser;
        return id_.toString() === userId;
      });

    let isTeamMember = false;
    if (board.team) {
      const team = await Team.findById(board.team);
      isTeamMember =
        !!team &&
        (team.owner?.toString() === userId ||
          (team.admins?.some(aid => aid.toString() === userId)) ||
          (team.members?.some(m => {
            const memberId = m.user ? m.user.toString() : '';
            return memberId === userId;
          })));
    }

    if (!isCreator && !isBoardMember && !isTeamMember) {
      res.status(403).json({ success: false, message: 'Not authorized to access this board' });
      return;
    }

    let columns: unknown[] = [];
    try {
      columns = await Column.find({ board: id }).sort('position');
      console.log(`Found ${columns.length} columns for board ${id}`);
    } catch (columnError) {
      console.error('Error fetching columns:', columnError);
    }

    res.status(200).json({
      success: true,
      data: {
        ...((board as unknown as { toObject(): Record<string, unknown> }).toObject()),
        columns: columns || []
      }
    });
  } catch (error) {
    console.error('Get board error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching board',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// Update board
const updateBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const boardId = req.params.id;
    const { title, description, backgroundColor, colorScheme, image } = req.body as Record<
      string,
      string | undefined
    >;

    const board = await Board.findById(boardId);

    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    if (board.createdBy.toString() !== req.user!.id) {
      res.status(403).json({ success: false, message: 'Not authorized to update this board' });
      return;
    }

    const updatedBoard = await Board.findByIdAndUpdate(
      boardId,
      {
        ...(title && { title }),
        ...(description && { description }),
        ...(backgroundColor && { backgroundColor }),
        ...(colorScheme && { colorScheme }),
        ...(image && { image })
      },
      { new: true, runValidators: true }
    )
      .populate('team', 'name')
      .populate('createdBy', 'username email name avatar');

    res.status(200).json({ success: true, data: updatedBoard });
  } catch (error) {
    console.error('Error updating board:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// Delete board
const deleteBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const boardId = req.params.id;

    if (!boardId) {
      res.status(400).json({ success: false, message: 'Board ID is required' });
      return;
    }

    console.log('Attempting to delete board with ID:', boardId);

    const board = await Board.findById(boardId);

    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    if (board.createdBy.toString() !== req.user!.id) {
      res.status(403).json({ success: false, message: 'Not authorized to delete this board' });
      return;
    }

    await Board.findByIdAndDelete(boardId);

    const deletedColumns = await Column.deleteMany({ board: boardId });
    console.log(`Deleted ${deletedColumns.deletedCount} columns`);

    res.status(200).json({
      success: true,
      message: 'Board and all associated columns deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting board:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

const getBoardsByTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { teamId } = req.params;
    console.log(`Getting boards for team ID: ${teamId}`);

    if (!mongoose.isValidObjectId(teamId)) {
      res.status(400).json({ success: false, message: 'Invalid team ID format' });
      return;
    }

    const team = await Team.findById(teamId);
    if (!team) {
      res.status(404).json({ success: false, message: 'Team not found' });
      return;
    }

    const isTeamMember =
      team.owner?.toString() === req.user!.id ||
      (team.admins && team.admins.some(aid => aid.toString() === req.user!.id)) ||
      (team.members &&
        team.members.some(m => {
          const memberId = m.user ? m.user.toString() : '';
          return memberId === req.user!.id;
        }));

    if (!isTeamMember) {
      res.status(403).json({ success: false, message: 'You are not a member of this team' });
      return;
    }

    const boards = await Board.find({ team: teamId })
      .populate('createdBy', 'name username avatar')
      .populate('members.user', 'name username avatar email')
      .populate('team', 'name')
      .sort({ updatedAt: -1 });

    console.log(`Found ${boards.length} boards for team`);

    res.status(200).json({ success: true, count: boards.length, data: boards });
  } catch (error) {
    console.error('Error getting team boards:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

const getAllBoardsComplete = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Getting complete boards data for user ID:', req.user!.id);

    const userTeams = await Team.find({ 'members.user': req.user!.id }).select('_id');

    const teamIds = userTeams.map(team => team._id);
    console.log(`User is member of ${teamIds.length} teams`);

    const boards = await Board.find({
      $or: [{ createdBy: req.user!.id }, { team: { $in: teamIds } }]
    })
      .populate('team', 'name avatar')
      .populate('createdBy', 'username email name avatar');

    console.log(`Found ${boards.length} boards`);

    if (boards.length === 0) {
      res.status(200).json({ success: true, count: 0, data: [] });
      return;
    }

    const boardIds = boards.map(board => board._id);

    const columns = await Column.find({ board: { $in: boardIds } }).sort({ position: 1 });

    console.log(`Found ${columns.length} columns`);

    const columnIds = columns.map(column => column._id);

    const tasks = await Task.find({ column: { $in: columnIds } })
      .populate('assignedTo', 'username email name avatar')
      .populate('createdBy', 'username email name avatar')
      .sort({ position: 1 });

    console.log(`Found ${tasks.length} tasks`);

    const completeBoards = boards.map(board => {
      const boardDoc = board as unknown as Record<string, unknown>;
      const boardColumns = columns
        .filter(column => column.board.toString() === board._id.toString())
        .map(column => {
          const columnTasks = tasks
            .filter(task => task.column.toString() === column._id.toString())
            .map(task => {
              const taskDoc = task as unknown as Record<string, unknown>;
              return {
                id: task._id,
                title: task.title,
                description: task.description || '',
                position: (taskDoc.position as number) || 0,
                dueDate: task.dueDate,
                priority: task.priority || 'medium',
                assignedTo: task.assignedTo,
                createdBy: task.createdBy,
                createdAt: taskDoc.createdAt,
                updatedAt: taskDoc.updatedAt
              };
            });

          const columnDoc = column as unknown as Record<string, unknown>;
          return {
            id: column._id,
            title: column.title,
            position: column.position || 0,
            tasks: columnTasks,
            tasksCount: columnTasks.length,
            createdAt: columnDoc.createdAt,
            updatedAt: columnDoc.updatedAt
          };
        });

      const createdByDoc = board.createdBy as unknown as { _id: { toString(): string } };

      return {
        id: board._id,
        title: board.title,
        description: board.description || '',
        team: board.team,
        createdBy: board.createdBy,
        backgroundColor: board.backgroundColor || '#f5f5f5',
        colorScheme: board.colorScheme || 'default',
        image: board.image,
        columns: boardColumns,
        columnsCount: boardColumns.length,
        totalTasks: boardColumns.reduce((sum, col) => sum + col.tasksCount, 0),
        createdAt: boardDoc.createdAt,
        updatedAt: boardDoc.updatedAt,
        isCreator: createdByDoc._id.toString() === req.user!.id
      };
    });

    res.status(200).json({ success: true, count: completeBoards.length, data: completeBoards });
  } catch (error) {
    console.error('Get all boards complete error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'An error occurred while retrieving board data'
    });
  }
};

// Add a member to a board
const addMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { email, role } = req.body as { email?: string; role?: string };

    if (!email) {
      res.status(400).json({ success: false, message: 'Email is required' });
      return;
    }

    const board = await Board.findById(id);
    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const isMember = board.members.some(
      member => member.user && member.user.toString() === user._id.toString()
    );

    if (isMember) {
      res.status(400).json({ success: false, message: 'User is already a member of this board' });
      return;
    }

    board.members.push({ user: user._id, role: (role as 'admin' | 'member' | 'viewer') || 'viewer' });

    await board.save();

    const updatedBoard = await Board.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('members.user', 'name username avatar email');

    res.status(200).json({ success: true, message: 'Member added successfully', data: updatedBoard });
  } catch (error) {
    console.error('Add board member error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding board member',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// Remove a member from a board
const removeMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, userId } = req.params;

    const board = await Board.findById(id);
    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    const requestingUserMember = board.members.find(
      m => m.user && m.user.toString() === req.user!.id
    );

    const isCreator = board.createdBy.toString() === req.user!.id;
    const isAdmin = requestingUserMember && requestingUserMember.role === 'admin';

    if (!isCreator && !isAdmin) {
      res.status(403).json({ success: false, message: 'Not authorized to remove board members' });
      return;
    }

    const memberIndex = board.members.findIndex(
      m => m.user && m.user.toString() === userId
    );

    if (memberIndex === -1) {
      res.status(404).json({ success: false, message: 'User is not a member of this board' });
      return;
    }

    board.members.splice(memberIndex, 1);

    await board.save();

    const updatedBoard = await Board.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('members.user', 'name username avatar email');

    res.status(200).json({ success: true, message: 'Member removed successfully', data: updatedBoard });
  } catch (error) {
    console.error('Remove board member error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while removing board member',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// Update member role in a board
const updateMemberRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body as { role?: string };

    if (!role || !['admin', 'member', 'viewer'].includes(role)) {
      res.status(400).json({
        success: false,
        message: 'Valid role is required (admin, member, or viewer)'
      });
      return;
    }

    const board = await Board.findById(id);
    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    const isCreator = board.createdBy.toString() === req.user!.id;
    const requestingUserMember = board.members.find(
      m => m.user && m.user.toString() === req.user!.id
    );
    const isAdmin = requestingUserMember && requestingUserMember.role === 'admin';

    if (!isCreator && !isAdmin) {
      res.status(403).json({ success: false, message: 'Not authorized to update member roles' });
      return;
    }

    const memberIndex = board.members.findIndex(
      m => m.user && m.user.toString() === userId
    );

    if (memberIndex === -1) {
      res.status(404).json({ success: false, message: 'User is not a member of this board' });
      return;
    }

    if (board.createdBy.toString() === userId) {
      res.status(400).json({ success: false, message: 'Cannot change the role of the board creator' });
      return;
    }

    board.members[memberIndex].role = role as 'admin' | 'member' | 'viewer';

    await board.save();

    const updatedBoard = await Board.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('members.user', 'name username avatar email');

    res.status(200).json({
      success: true,
      message: 'Member role updated successfully',
      data: updatedBoard
    });
  } catch (error) {
    console.error('Update board member role error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating member role',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// Create a column in a board
const createColumn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, order } = req.body as { name?: string; order?: number };

    if (!name) {
      res.status(400).json({ success: false, message: 'Column name is required' });
      return;
    }

    const board = await Board.findById(id);
    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    const isMember = board.members.some(
      member => member.user && member.user.toString() === req.user!.id
    );
    const isCreator = board.createdBy.toString() === req.user!.id;

    if (!isCreator && !isMember) {
      res.status(403).json({ success: false, message: 'Not authorized to add columns to this board' });
      return;
    }

    let columnOrder = order;
    if (columnOrder === undefined) {
      const lastColumn = await Column.findOne({ board: id }).sort({ position: -1 }).limit(1);
      columnOrder = lastColumn ? lastColumn.position + 1 : 0;
    }

    const column = await Column.create({ title: name, position: columnOrder, board: id });

    res.status(201).json({ success: true, message: 'Column created successfully', data: column });
  } catch (error) {
    console.error('Create column error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating column',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// Update a column in a board
const updateColumn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { boardId, columnId } = req.params;
    const { name, order } = req.body as { name?: string; order?: number };

    const board = await Board.findById(boardId);
    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    const isMember = board.members.some(
      member => member.user && member.user.toString() === req.user!.id
    );
    const isCreator = board.createdBy.toString() === req.user!.id;

    if (!isCreator && !isMember) {
      res.status(403).json({ success: false, message: 'Not authorized to update columns in this board' });
      return;
    }

    const column = await Column.findById(columnId);
    if (!column) {
      res.status(404).json({ success: false, message: 'Column not found' });
      return;
    }

    if (column.board.toString() !== boardId) {
      res.status(400).json({ success: false, message: 'Column does not belong to this board' });
      return;
    }

    if (name !== undefined) column.title = name;
    if (order !== undefined) column.position = order;

    await column.save();

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

// Delete a column from a board
const deleteColumn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { boardId, columnId } = req.params;

    const board = await Board.findById(boardId);
    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    const isMember = board.members.some(
      member => member.user && member.user.toString() === req.user!.id
    );
    const isCreator = board.createdBy.toString() === req.user!.id;

    if (!isCreator && !isMember) {
      res.status(403).json({ success: false, message: 'Not authorized to delete columns from this board' });
      return;
    }

    const column = await Column.findById(columnId);
    if (!column) {
      res.status(404).json({ success: false, message: 'Column not found' });
      return;
    }

    if (column.board.toString() !== boardId) {
      res.status(400).json({ success: false, message: 'Column does not belong to this board' });
      return;
    }

    const tasks = await Task.find({ column: columnId });

    if (tasks.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete column with tasks. Move tasks to another column first.'
      });
      return;
    }

    await Column.findByIdAndDelete(columnId);

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

// Share a board
const shareBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { emails, role } = req.body as { emails?: unknown; role?: string };

    if (!emails || !Array.isArray(emails)) {
      res.status(400).json({ success: false, message: 'Valid email array is required' });
      return;
    }

    const board = await Board.findById(id);
    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    const isCreator = board.createdBy.toString() === req.user!.id;
    const requestingUserMember = board.members.find(
      m => m.user && m.user.toString() === req.user!.id
    );
    const isAdmin = requestingUserMember && requestingUserMember.role === 'admin';

    if (!isCreator && !isAdmin) {
      res.status(403).json({ success: false, message: 'Not authorized to share this board' });
      return;
    }

    const results: {
      success: string[];
      notFound: string[];
      alreadyMember: string[];
    } = { success: [], notFound: [], alreadyMember: [] };

    for (const email of emails as string[]) {
      const user = await User.findOne({ email });

      if (!user) {
        results.notFound.push(email);
        continue;
      }

      const isMember = board.members.some(
        member => member.user && member.user.toString() === user._id.toString()
      );

      if (isMember) {
        results.alreadyMember.push(email);
        continue;
      }

      board.members.push({
        user: user._id,
        role: (role as 'admin' | 'member' | 'viewer') || 'viewer',
        addedAt: new Date(),
        addedBy: (new (mongoose.Types.ObjectId as unknown as new (id: string) => mongoose.Types.ObjectId)(req.user!.id))
      });

      results.success.push(email);
    }

    await board.save();

    const updatedBoard = await Board.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('members.user', 'name username avatar email');

    res.status(200).json({
      success: true,
      message: 'Board shared successfully',
      results,
      data: updatedBoard
    });
  } catch (error) {
    console.error('Share board error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while sharing board',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

export {
  createBoard,
  getBoards,
  getBoardById,
  updateBoard,
  deleteBoard,
  getBoardsByTeam,
  getAllBoardsComplete,
  addMember,
  removeMember,
  updateMemberRole,
  createColumn,
  updateColumn,
  deleteColumn,
  shareBoard
};
