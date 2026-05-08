const mongoose = require('mongoose');
const Board = require('../models/Board');
const Team = require('../models/Team');
const Column = require('../models/Column');
const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Activity = require('../models/Activity');
const { logBoardActivity } = require('../services/activityService');

/**
 * Create a new board
 * @route POST /api/boards
 */
const createBoard = async (req, res) => {
  try {
    const { title, description, teamId } = req.body;

    // Validate required fields
    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Board title is required'
      });
    }

    // Create the board
    const board = await Board.create({
      title,
      description: description || '',
      team: teamId || null,
      createdBy: req.user.id,
      members: [{ user: req.user.id, role: 'admin' }],
      ...(req.tenantId && { tenant: req.tenantId })
    });

    // Create default columns with proper validation
    const defaultColumns = [
      { title: 'To Do', board: board._id, order: 0 },
      { title: 'In Progress', board: board._id, order: 1 },
      { title: 'Done', board: board._id, order: 2 }
    ];

    // Make sure all columns have titles
    for (const column of defaultColumns) {
      if (!column.title) {
        throw new Error('Default column must have a title');
      }
    }

    await Column.insertMany(defaultColumns);

    // Fetch the populated board
    const populatedBoard = await Board.findById(board._id)
      .populate('createdBy', 'name username avatar')
      .populate('members.user', 'name username avatar email')
      .populate('team', 'name');

    // Get columns for the board
    const columns = await Column.find({ board: board._id }).sort('order');

    // Log activity
    await Activity.create({
      user: req.user.id,
      action: 'created_board',
      boardId: board._id,
      teamId: teamId || null,
      description: `Created board "${title}"`,
      metadata: { boardTitle: title }
    });

    return res.status(201).json({
      success: true,
      message: 'Board created successfully',
      data: {
        ...populatedBoard._doc,
        columns
      }
    });
  } catch (error) {
    console.error('Create board error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while creating board',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all boards
const getBoards = async (req, res) => {
  try {
    const boardFilter = {
      $or: [
        { createdBy: req.user.id },
        { 'members.user': req.user.id }
      ],
      ...(req.tenantId && { tenant: req.tenantId })
    };
    const boards = await Board.find(boardFilter)
      .populate('team', 'name')
      .populate('createdBy', 'username email')
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: boards.length,
      data: boards
    });
  } catch (error) {
    console.error('Error getting boards:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get board by ID - modified for debugging
const getBoardById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid board ID format'
      });
    }

    console.log(`Getting board with ID: ${id} for user ${userId}`);

    // First let's check if the board exists at all
    const boardExists = await Board.exists({ _id: id });
    if (!boardExists) {
      console.log(`Board with ID ${id} does not exist in the database`);
      return res.status(404).json({
        success: false,
        message: 'Board not found in database'
      });
    }

    // If board exists, get full details
    const board = await Board.findOne({ _id: id, deleted: { $ne: true } })
      .populate('createdBy', 'name username avatar')
      .populate('members.user', 'name username avatar email')
      .populate('team', 'name');

    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }

    // Log board and permission details for debugging
    console.log('BOARD FOUND:', {
      id: board._id,
      title: board.title,
      createdBy: board.createdBy ? board.createdBy._id : 'unknown',
      team: board.team ? board.team._id : 'none',
      memberCount: board.members ? board.members.length : 0
    });

    // More permissive check - include creator, direct members, and team members
    const isCreator = board.createdBy && board.createdBy._id.toString() === userId;
    const isBoardMember = board.members && board.members.some(m => 
      m.user && (m.user._id || m.user).toString() === userId
    );
    
    let isTeamMember = false;
    if (board.team) {
      const team = await Team.findById(board.team);
      isTeamMember = team && (
        team.owner?.toString() === userId || 
        team.admins?.some(id => id.toString() === userId) ||
        team.members?.some(m => {
          const memberId = m.user ? m.user.toString() : m.toString();
          return memberId === userId;
        })
      );
    }

    // Log permission results
    console.log('PERMISSION CHECK:', {
      userId,
      isCreator,
      isBoardMember,
      isTeamMember,
      hasAccess: isCreator || isBoardMember || isTeamMember
    });

    if (!isCreator && !isBoardMember && !isTeamMember) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this board'
      });
    }

    // Add columns for this board with better error handling
    let columns = [];
    try {
      columns = await Column.find({ board: id }).sort('order');
      console.log(`Found ${columns.length} columns for board ${id}`);
    } catch (columnError) {
      console.error('Error fetching columns:', columnError);
      // Continue execution even if columns fetch fails
    }

    return res.status(200).json({
      success: true,
      data: {
        ...board._doc,
        columns: columns || []
      }
    });
  } catch (error) {
    console.error('Get board error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching board',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update board
const updateBoard = async (req, res) => {
  try {
    const boardId = req.params.id;
    const { title, description, backgroundColor, colorScheme, image } = req.body;
    
    // Find board
    const board = await Board.findById(boardId);
    
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }
    
    // Check ownership
    if (board.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this board'
      });
    }
    
    // Find and update the board
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
    ).populate('team', 'name avatar')
     .populate('createdBy', 'username email name avatar');
    
    // Log activity
    await logBoardActivity(
      'update_board',
      req.user,
      updatedBoard,
      `${req.user.username || 'A user'} updated board "${updatedBoard.title}"`,
      { updatedFields: Object.keys(req.body) }
    );
    
    res.status(200).json({
      success: true,
      data: updatedBoard
    });
  } catch (error) {
    console.error('Error updating board:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete board
const deleteBoard = async (req, res) => {
  try {
    const boardId = req.params.id;
    
    // Add validation to check if boardId exists
    if (!boardId) {
      return res.status(400).json({
        success: false,
        message: 'Board ID is required'
      });
    }
    
    console.log('Attempting to delete board with ID:', boardId);
    
    const board = await Board.findById(boardId);
    
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }
    
    if (board.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this board'
      });
    }
    
    // Use findByIdAndDelete for a more reliable operation
    await Board.findByIdAndDelete(boardId);
    
    // Additionally, you might want to delete related columns and tasks
    const deletedColumns = await Column.deleteMany({ board: boardId });
    console.log(`Deleted ${deletedColumns.deletedCount} columns`);
    
    // Log activity
    await logBoardActivity(
      'delete_board',
      req.user,
      board,
      `${req.user.username || 'A user'} deleted board "${board.title}"`,
      { boardTitle: board.title }
    );
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'Board and all associated columns deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting board:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getBoardsByTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    console.log(`Getting boards for team ID: ${teamId}`);
    
    // Check if valid team ID
    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid team ID format'
      });
    }
    
    // Check if team exists
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }
    
    // More comprehensive check for team membership
    const isTeamMember = team.owner?.toString() === req.user.id || 
                         (team.admins && team.admins.some(id => id.toString() === req.user.id)) ||
                         (team.members && team.members.some(m => {
                            // Handle both cases: if member is just an ID or an object with user property
                            const memberId = m.user ? m.user.toString() : m.toString();
                            return memberId === req.user.id;
                         }));
    
    if (!isTeamMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this team'
      });
    }
    
    const boards = await Board.find({ team: teamId })
      .populate('createdBy', 'name username avatar')
      .populate('members.user', 'name username avatar email')
      .populate('team', 'name')
      .sort({ updatedAt: -1 });
    
    console.log(`Found ${boards.length} boards for team`);
    
    res.status(200).json({
      success: true,
      count: boards.length,
      data: boards
    });
  } catch (error) {
    console.error('Error getting team boards:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getAllBoardsComplete = async (req, res) => {
  try {
    console.log('Getting complete boards data for user ID:', req.user.id);
    
    const userTeams = await Team.find({ 
      'members.user': req.user.id 
    }).select('_id');
    
    const teamIds = userTeams.map(team => team._id);
    console.log(`User is member of ${teamIds.length} teams`);
    
    const boards = await Board.find({ 
      $or: [
        { createdBy: req.user.id },
        { team: { $in: teamIds } }
      ] 
    })
    .populate('team', 'name avatar')
    .populate('createdBy', 'username email name avatar');
    
    console.log(`Found ${boards.length} boards`);
    
    if (boards.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: []
      });
    }
    
    const boardIds = boards.map(board => board._id);
    console.log('Board IDs:', boardIds);
    
    const columns = await Column.find({ board: { $in: boardIds } })
      .sort({ position: 1 });
    
    console.log(`Found ${columns.length} columns`);

    const columnIds = columns.map(column => column._id);
    
    const tasks = await Task.find({ column: { $in: columnIds } })
      .populate('assignedTo', 'username email name avatar')
      .populate('createdBy', 'username email name avatar')
      .sort({ position: 1 });
      
    console.log(`Found ${tasks.length} tasks`);
    
    const completeBoards = boards.map(board => {
      const boardColumns = columns
        .filter(column => column.board.toString() === board._id.toString())
        .map(column => {
          const columnTasks = tasks
            .filter(task => task.column.toString() === column._id.toString())
            .map(task => ({
              id: task._id,
              title: task.title,
              description: task.description || '',
              position: task.position || 0,
              dueDate: task.dueDate,
              priority: task.priority || 'medium',
              labels: task.labels || [],
              assignedTo: task.assignedTo,
              createdBy: task.createdBy,
              createdAt: task.createdAt,
              updatedAt: task.updatedAt
            }));
          
          return {
            id: column._id,
            title: column.title,
            position: column.position || 0,
            tasks: columnTasks,
            tasksCount: columnTasks.length,
            createdAt: column.createdAt,
            updatedAt: column.updatedAt
          };
        });
      
      return {
        id: board._id,
        title: board.name || board.title,
        description: board.description || '',
        team: board.team,
        createdBy: board.createdBy,
        backgroundColor: board.backgroundColor || '#f5f5f5',
        colorScheme: board.colorScheme || 'default',
        image: board.image,
        columns: boardColumns,
        columnsCount: boardColumns.length,
        totalTasks: boardColumns.reduce((sum, column) => sum + column.tasksCount, 0),
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
        isCreator: board.createdBy._id.toString() === req.user.id
      };
    });
    
    res.status(200).json({
      success: true,
      count: completeBoards.length,
      data: completeBoards
    });
  } catch (error) {
    console.error('Get all boards complete error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while retrieving board data'
    });
  }
};

// Add a member to a board
const addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, role } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    
    const board = await Board.findById(id);
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }
    
    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if user is already a member
    const isMember = board.members.some(member => 
      member.user && member.user.toString() === user._id.toString()
    );
    
    if (isMember) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of this board'
      });
    }
    
    // Add member to the board
    board.members.push({
      user: user._id,
      role: role || 'viewer'
    });
    
    await board.save();
    
    // Get updated board with populated members
    const updatedBoard = await Board.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('members.user', 'name username avatar email');
    
    return res.status(200).json({
      success: true,
      message: 'Member added successfully',
      data: updatedBoard
    });
  } catch (error) {
    console.error('Add board member error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while adding board member',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Remove a member from a board
const removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;
    
    const board = await Board.findById(id);
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }
    
    // Check permissions - only creator or admin can remove members
    const requestingUserMember = board.members.find(m => 
      m.user && m.user.toString() === req.user.id
    );
    
    const isCreator = board.createdBy.toString() === req.user.id;
    const isAdmin = requestingUserMember && requestingUserMember.role === 'admin';
    
    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to remove board members'
      });
    }
    
    // Check if user is actually a member
    const memberIndex = board.members.findIndex(m => 
      m.user && m.user.toString() === userId
    );
    
    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User is not a member of this board'
      });
    }
    
    // Remove member
    board.members.splice(memberIndex, 1);
    
    await board.save();
    
    // Get updated board with populated members
    const updatedBoard = await Board.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('members.user', 'name username avatar email');
    
    return res.status(200).json({
      success: true,
      message: 'Member removed successfully',
      data: updatedBoard
    });
  } catch (error) {
    console.error('Remove board member error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while removing board member',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update member role in a board
const updateMemberRole = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;
    
    if (!role || !['admin', 'member', 'viewer'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Valid role is required (admin, member, or viewer)'
      });
    }
    
    const board = await Board.findById(id);
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }
    
    // Check permissions - only creator or admin can update roles
    const isCreator = board.createdBy.toString() === req.user.id;
    const requestingUserMember = board.members.find(m => 
      m.user && m.user.toString() === req.user.id
    );
    const isAdmin = requestingUserMember && requestingUserMember.role === 'admin';
    
    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update member roles'
      });
    }
    
    // Find the member to update
    const memberIndex = board.members.findIndex(m => 
      m.user && m.user.toString() === userId
    );
    
    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User is not a member of this board'
      });
    }
    
    // Don't allow changing roles of the creator
    if (board.createdBy.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change the role of the board creator'
      });
    }
    
    // Update the role
    board.members[memberIndex].role = role;
    
    await board.save();
    
    // Get updated board with populated members
    const updatedBoard = await Board.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('members.user', 'name username avatar email');
    
    return res.status(200).json({
      success: true,
      message: 'Member role updated successfully',
      data: updatedBoard
    });
  } catch (error) {
    console.error('Update board member role error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating member role',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create a column in a board
const createColumn = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, order } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Column name is required'
      });
    }
    
    const board = await Board.findById(id);
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }
    
    // Check if user has permission to add columns
    const isMember = board.members.some(member => 
      member.user && member.user.toString() === req.user.id
    );
    
    const isCreator = board.createdBy.toString() === req.user.id;
    
    if (!isCreator && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add columns to this board'
      });
    }
    
    // Determine order if not provided
    let columnOrder = order;
    if (columnOrder === undefined) {
      // Find highest order number and add 1
      const lastColumn = await Column.findOne({ board: id })
        .sort({ order: -1 })
        .limit(1);
      
      columnOrder = lastColumn ? lastColumn.order + 1 : 0;
    }
    
    // Create the column
    const column = await Column.create({
      name,
      order: columnOrder,
      board: id,
      createdBy: req.user.id
    });
    
    return res.status(201).json({
      success: true,
      message: 'Column created successfully',
      data: column
    });
  } catch (error) {
    console.error('Create column error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while creating column',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update a column in a board
const updateColumn = async (req, res) => {
  try {
    const { boardId, columnId } = req.params;
    const { name, order } = req.body;
    
    // Check if board exists
    const board = await Board.findById(boardId);
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }
    
    // Check if user has permission to update columns
    const isMember = board.members.some(member => 
      member.user && member.user.toString() === req.user.id
    );
    const isCreator = board.createdBy.toString() === req.user.id;
    
    if (!isCreator && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update columns in this board'
      });
    }
    
    // Find and update the column
    const column = await Column.findById(columnId);
    if (!column) {
      return res.status(404).json({
        success: false,
        message: 'Column not found'
      });
    }
    
    // Check if column belongs to this board
    if (column.board.toString() !== boardId) {
      return res.status(400).json({
        success: false,
        message: 'Column does not belong to this board'
      });
    }
    
    // Update the column
    if (name !== undefined) column.name = name;
    if (order !== undefined) column.order = order;
    column.updatedAt = Date.now();
    
    await column.save();
    
    return res.status(200).json({
      success: true,
      message: 'Column updated successfully',
      data: column
    });
  } catch (error) {
    console.error('Update column error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating column',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete a column from a board
const deleteColumn = async (req, res) => {
  try {
    const { boardId, columnId } = req.params;
    
    // Check if board exists
    const board = await Board.findById(boardId);
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }
    
    // Check if user has permission to delete columns
    const isMember = board.members.some(member => 
      member.user && member.user.toString() === req.user.id
    );
    const isCreator = board.createdBy.toString() === req.user.id;
    
    if (!isCreator && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete columns from this board'
      });
    }
    
    // Find the column
    const column = await Column.findById(columnId);
    if (!column) {
      return res.status(404).json({
        success: false,
        message: 'Column not found'
      });
    }
    
    // Check if column belongs to this board
    if (column.board.toString() !== boardId) {
      return res.status(400).json({
        success: false,
        message: 'Column does not belong to this board'
      });
    }
    
    // Find tasks in this column
    const tasks = await Task.find({ column: columnId });
    
    if (tasks.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete column with tasks. Move tasks to another column first.'
      });
    }
    
    // Delete the column
    await Column.findByIdAndDelete(columnId);
    
    return res.status(200).json({
      success: true,
      message: 'Column deleted successfully'
    });
  } catch (error) {
    console.error('Delete column error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting column',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Share a board
const shareBoard = async (req, res) => {
  try {
    const { id } = req.params;
    const { emails, role } = req.body;
    
    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({
        success: false,
        message: 'Valid email array is required'
      });
    }
    
    const board = await Board.findById(id);
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }
    
    // Check permissions
    const isCreator = board.createdBy.toString() === req.user.id;
    const requestingUserMember = board.members.find(m => 
      m.user && m.user.toString() === req.user.id
    );
    const isAdmin = requestingUserMember && requestingUserMember.role === 'admin';
    
    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to share this board'
      });
    }
    
    // Process each email
    const results = {
      success: [],
      notFound: [],
      alreadyMember: []
    };
    
    for (const email of emails) {
      const user = await User.findOne({ email });
      
      if (!user) {
        results.notFound.push(email);
        continue;
      }
      
      // Check if already a member
      const isMember = board.members.some(member => 
        member.user && member.user.toString() === user._id.toString()
      );
      
      if (isMember) {
        results.alreadyMember.push(email);
        continue;
      }
      
      // Add as a member
      board.members.push({
        user: user._id,
        role: role || 'viewer',
        addedAt: new Date(),
        addedBy: req.user.id
      });
      
      results.success.push(email);
    }
    
    await board.save();
    
    // Get updated board with populated members
    const updatedBoard = await Board.findById(id)
      .populate('createdBy', 'name username avatar')
      .populate('members.user', 'name username avatar email');
    
    return res.status(200).json({
      success: true,
      message: 'Board shared successfully',
      results,
      data: updatedBoard
    });
  } catch (error) {
    console.error('Share board error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while sharing board',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = { 
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