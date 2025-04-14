const Board = require('../models/Board');
const Team = require('../models/Team');

// Create a new board
const createBoard = async (req, res) => {
    try {
        // Log the request body for debugging
        console.log('Creating board with data:', req.body);
        
        // Extract data from request body
        const { name, description, team, teamId } = req.body;
        
        // Use either team or teamId (for backward compatibility)
        const teamIdentifier = team || teamId;
        
        if (!teamIdentifier) {
            return res.status(400).json({
                success: false,
                message: 'Team ID is required'
            });
        }
        
        console.log('Using team ID:', teamIdentifier);
        
        // Check if team exists
        const teamExists = await Team.findById(teamIdentifier);
        if (!teamExists) {
            return res.status(404).json({
                success: false,
                message: 'Team not found'
            });
        }
        
        // Prepare board data
        const boardData = {
            name,
            description,
            team: teamIdentifier, // Ensure this matches your schema field name
            createdBy: req.user.id
        };
        
        console.log('Creating board with processed data:', boardData);
        
        // Create the board
        const board = await Board.create(boardData);
        
        // Return success response
        return res.status(201).json({
            success: true,
            message: 'Board created successfully',
            data: board
        });
    } catch (error) {
        console.error('Board creation error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create board',
            error: error.message
        });
    }
};

// Get all boards for a user
const getBoards = async (req, res) => {
  try {
    console.log('Getting boards for user ID:', req.user.id);
    
    // Find boards created by this user or in teams they belong to
    const boards = await Board.find({
      $or: [
        { createdBy: req.user.id }, // Boards created by the user
      ]
    })
    .populate('team', 'name')
    .sort({ updatedAt: -1 });
    
    console.log(`Found ${boards.length} boards`);
    
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

// Get board by ID
const getBoardById = async (req, res) => {
  try {
    const board = await Board.findById(req.params.id)
      .populate('team', 'name')
      .populate('createdBy', 'username email');
    
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }
    
    // Make sure the board belongs to the user or user is in the team
    const isCreator = board.createdBy._id.toString() === req.user.id;
    
    // If needed, you can also check if user is in the team
    // const isTeamMember = await Team.findOne({
    //   _id: board.team._id,
    //   'members.user': req.user.id
    // });
    
    if (!isCreator) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this board'
      });
    }
    
    res.status(200).json({
      success: true,
      data: board
    });
  } catch (error) {
    console.error('Error getting board by ID:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update board
const updateBoard = async (req, res) => {
  try {
    const { name, description } = req.body;
    const board = await Board.findById(req.params.id);
    
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }
    
    // Make sure the board belongs to the user
    if (board.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this board'
      });
    }
    
    // Update fields
    if (name) board.name = name;
    if (description !== undefined) board.description = description;
    
    await board.save();
    
    res.status(200).json({
      success: true,
      data: board
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
    const board = await Board.findById(req.params.id);
    
    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }
    
    // Make sure the board belongs to the user
    if (board.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this board'
      });
    }
    
    await Board.deleteOne({ _id: req.params.id });
    
    res.status(200).json({
      success: true,
      message: 'Board deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting board:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get boards by team
const getBoardsByTeam = async (req, res) => {
  try {
    const teamId = req.params.teamId;
    console.log('Getting boards for team ID:', teamId);
    
    // Find boards for this team
    const boards = await Board.find({ team: teamId })
      .populate('createdBy', 'username email')
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

// Export all functions
module.exports = { 
  createBoard, 
  getBoards, 
  getBoardById,
  updateBoard,
  deleteBoard,
  getBoardsByTeam
};