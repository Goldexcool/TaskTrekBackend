const mongoose = require('mongoose');
const Team = require('../models/Team');
const Board = require('../models/Board');
const User = require('../models/User');
const { logTeamActivity } = require('../services/activityService');
const Activity = require('../models/Activity');
const Notification = require('../models/Notification');

const createTeam = async (req, res) => {
  try {
    const { name, description, members } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Team name is required'
      });
    }
    
    // Format members properly
    let formattedMembers = [];
    
    if (members) {
      if (typeof members === 'string') {
        try {
          const parsedMembers = JSON.parse(members);
          if (Array.isArray(parsedMembers)) {
            formattedMembers = parsedMembers.map(m => ({
              user: m.user,
              role: m.role || 'viewer'
            }));
          }
        } catch (e) {
          console.error('Failed to parse members JSON:', e);
        }
      } else if (Array.isArray(members)) {
        formattedMembers = members.map(m => {
          if (typeof m === 'string') {
            return { user: m, role: 'viewer' };
          } else if (m && m.user) {
            return { user: m.user, role: m.role || 'viewer' };
          }
          return null;
        }).filter(Boolean);
      }
    }
    
    // Make sure owner is included as a member with admin role
    const ownerInMembers = formattedMembers.some(m => 
      m.user.toString() === req.user.id
    );
    
    if (!ownerInMembers) {
      formattedMembers.push({
        user: req.user.id,
        role: 'admin'
      });
    }
    
    // Create team
    const team = await Team.create({
      name,
      description: description || '',
      owner: req.user.id,
      members: formattedMembers,
      ...(req.tenantId && { tenant: req.tenantId })
    });
    
    // Populate team data
    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'name username avatar')
      .populate('members.user', 'name username avatar email');
    
    try {
      await logTeamActivity(req.user.id, 'created_team', team._id, {
        teamName: team.name
      });
    } catch (logError) {
      // Log the error but don't fail the request
      console.error('Failed to log team activity:', logError);
    }
    
    return res.status(201).json({
      success: true,
      message: 'Team created successfully',
      data: populatedTeam
    });
  } catch (error) {
    console.error('Create team error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while creating team',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getTeams = async (req, res) => {
  try {
    // Find teams where the user is a member, optionally scoped to tenant
    const teamQuery = {
      members: { $elemMatch: { user: req.user.id } },
      ...(req.tenantId && { tenant: req.tenantId })
    };
    const teams = await Team.find(teamQuery).populate('owner', 'username email');
    
    res.status(200).json({
      success: true,
      count: teams.length,
      data: teams
    });
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while fetching teams'
    });
  }
};

const getTeamById = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('owner', 'username email')
      .populate('members.user', 'username email');
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }
    
    // Check if user is a member of the team
    if (!team.members.some(member => member.user._id.toString() === req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to access this team'
      });
    }
    
    res.status(200).json({
      success: true,
      data: team
    });
  } catch (error) {
    console.error('Get team by ID error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while fetching the team'
    });
  }
};


const updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    // Find team
    const team = await Team.findById(id);
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }
    
    // Check if user has permission to update the team
    if (team.owner.toString() !== req.user.id && 
        !team.admins.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this team'
      });
    }
    
    // Update team fields
    if (name) team.name = name;
    if (description !== undefined) team.description = description;
    
    // Save updated team
    await team.save();
    
    return res.status(200).json({
      success: true,
      message: 'Team updated successfully',
      data: team
    });
  } catch (error) {
    console.error('Update team error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const deleteTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }
    
    if (team.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this team'
      });
    }
    
    await User.updateMany(
      { teams: team._id },
      { $pull: { teams: team._id } }
    );
    
    // Delete the team
    await team.deleteOne();
    
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while deleting the team'
    });
  }
};

// Add member to team
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
    
    // Find the team
    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }
    
    // Check if user is authorized to add members
    if (team.owner.toString() !== req.user.id) {
      const isAdmin = team.members.some(member => 
        member.user && member.user.toString() === req.user.id && member.role === 'admin'
      );
      
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to add members to this team'
        });
      }
    }
    
    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User with that email not found'
      });
    }
    
    // Check if user is already a member
    const isMember = team.members.some(member => 
      member.user && member.user.toString() === user._id.toString()
    );
    
    if (isMember) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of this team'
      });
    }
    
    // Add user to team members
    team.members.push({
      user: user._id,  // Make sure we're setting the user field
      role: role || 'viewer'
    });
    
    await team.save();
    
    // Populate the team data
    const updatedTeam = await Team.findById(id)
      .populate('owner', 'name username avatar')
      .populate('members.user', 'name username avatar email');
    
    // Log the activity
    try {
      await Activity.create({
        user: req.user.id,
        action: 'added_member',
        teamId: team._id,
        description: `Added a member to team "${team.name}"`,
        metadata: {
          teamName: team.name,
          memberEmail: email,
          memberRole: role || 'viewer'
        }
      });
    } catch (activityError) {
      console.error('Failed to log team activity:', activityError);
    }
    
    // Create notification for the added user
    try {
      await Notification.create({
        recipient: user._id,
        type: 'team_invite',
        message: `You have been added to the team "${team.name}"`,
        sender: req.user.id,
        relatedTeam: team._id
      });
    } catch (notifError) {
      console.error('Failed to create notification:', notifError);
    }
    
    return res.status(200).json({
      success: true,
      message: 'Member added successfully',
      data: updatedTeam
    });
  } catch (error) {
    console.error('Add team member error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while adding team member',
      error: error.message
    });
  }
};

const removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;
    
    // Find the team
    const team = await Team.findById(id);
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }
    
    // Check if the current user is the team owner
    if (team.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the team owner can remove members'
      });
    }
    
    // Prevent removing the owner
    if (team.owner.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove the team owner'
      });
    }
    
    // Check if user is a member
    if (!team.members.some(member => member.user.toString() === userId)) {
      return res.status(400).json({
        success: false,
        message: 'User is not a member of this team'
      });
    }
    
    team.members = team.members.filter(member => member.user.toString() !== userId);
    await team.save();
    
    await User.findByIdAndUpdate(userId, {
      $pull: { teams: team._id }
    });
    
    res.status(200).json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while removing the member'
    });
  }
};

const changeRole = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;
    
    // Validate role
    if (!role || !['admin', 'member'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid role (admin or member)'
      });
    }
    
    // Find the team
    const team = await Team.findById(id);
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }
    
    // Check if current user is an admin
    const currentUserMember = team.members.find(
      member => member.user.toString() === req.user.id
    );
    
    if (!currentUserMember || currentUserMember.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only team admins can change roles'
      });
    }
    
    // Find the target member
    const targetMemberIndex = team.members.findIndex(
      member => member.user.toString() === userId
    );
    
    if (targetMemberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User is not a member of this team'
      });
    }
    
    // If we're removing admin from ourselves, ensure there's at least one other admin
    if (userId === req.user.id && role === 'member') {
      const otherAdmins = team.members.filter(
        member => member.role === 'admin' && member.user.toString() !== req.user.id
      );
      
      if (otherAdmins.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot change role: The team needs at least one admin'
        });
      }
    }
    
    // Update the role
    team.members[targetMemberIndex].role = role;
    await team.save();
    
    if (team.owner.toString() === userId && role === 'member') {
      const newAdmin = team.members.find(
        member => member.role === 'admin' && member.user.toString() !== userId
      );
      
      if (newAdmin) {
        team.owner = newAdmin.user;
        await team.save();
      }
    }
    
    if (role === 'admin' && !team.owner) {
      team.owner = userId;
      await team.save();
    }
    
    res.status(200).json({
      success: true,
      message: `Role updated successfully to ${role}`,
      data: {
        teamId: team._id,
        userId,
        newRole: role,
        owner: team.owner
      }
    });
  } catch (error) {
    console.error('Change role error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while changing the role'
    });
  }
};

const transferOwnership = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide the user ID to transfer ownership to'
      });
    }
    
    // Find the team
    const team = await Team.findById(id);
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }
    
    // Verify current user is the owner
    if (team.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the team owner can transfer ownership'
      });
    }
    
    // Check if the target user is a member
    const targetMemberIndex = team.members.findIndex(
      member => member.user.toString() === userId
    );
    
    if (targetMemberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User is not a member of this team'
      });
    }
    
    team.members[targetMemberIndex].role = 'admin';
    
    // Change the owner
    team.owner = userId;
    
    await team.save();
    
    res.status(200).json({
      success: true,
      message: 'Team ownership transferred successfully',
      data: {
        teamId: team._id,
        newOwner: userId
      }
    });
  } catch (error) {
    console.error('Transfer ownership error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while transferring ownership'
    });
  }
};

const checkTeamExists = async (req, res) => {
  try {
    const { teamId } = req.params;
    
    if (!teamId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(200).json({
        success: true,
        exists: false,
        message: 'Invalid team ID format'
      });
    }
    
    const team = await Team.findById(teamId).select('name avatar');
    
    if (!team) {
      return res.status(200).json({
        success: true,
        exists: false,
        message: 'Team not found'
      });
    }
    
    // Team exists - return basic info
    return res.status(200).json({
      success: true,
      exists: true,
      team: {
        id: team._id,
        name: team.name,
        avatar: team.avatar
      }
    });
  } catch (error) {
    console.error('Check team exists error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while checking if team exists'
    });
  }
};

const getTeamMembers = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the team and populate member information
    const team = await Team.findById(id)
      .populate({
        path: 'members.user',
        select: 'username email name avatar'
      });
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }
    
    // Check if the current user is a member of this team
    const isMember = team.members.some(
      member => member.user._id.toString() === req.user.id
    );
    
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this team'
      });
    }
    
    // Format the response
    const members = team.members.map(member => ({
      id: member.user._id,
      username: member.user.username,
      email: member.user.email,
      name: member.user.name,
      avatar: member.user.avatar,
      role: member.role,
      joinedAt: member.joinedAt,
      isOwner: team.owner.toString() === member.user._id.toString()
    }));
    
    res.status(200).json({
      success: true,
      count: members.length,
      data: members
    });
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while fetching team members'
    });
  }
};


const searchTeams = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a search query'
      });
    }
    
    // Get user's teams first
    const user = await User.findById(req.user.id).populate('teams');
    const userTeamIds = user.teams.map(team => team._id);
    
    // Search for teams by name or description that user is a member of
    const teams = await Team.find({
      _id: { $in: userTeamIds },
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    }).select('name description avatar owner members createdAt')
    .populate('owner', 'username email name avatar');
    
    // Format the response
    const formattedTeams = teams.map(team => ({
      id: team._id,
      name: team.name,
      description: team.description,
      avatar: team.avatar,
      owner: {
        id: team.owner._id,
        username: team.owner.username,
        name: team.owner.name || team.owner.username,
        avatar: team.owner.avatar
      },
      memberCount: team.members.length,
      createdAt: team.createdAt,
      isOwner: team.owner._id.toString() === req.user.id
    }));
    
    res.status(200).json({
      success: true,
      count: formattedTeams.length,
      data: formattedTeams
    });
  } catch (error) {
    console.error('Team search error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while searching for teams'
    });
  }
};

const inviteUser = async (req, res) => {
  try {
    const { email, teamId } = req.body;
    
    // Find team and target user
    const team = await Team.findById(teamId);
    const targetUser = await User.findOne({ email });
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    
    try {
      await logTeamActivity(
        'invite_user',
        req.user,
        team,
        targetUser,
        `${req.user.username || 'A user'} invited ${targetUser.username || email} to team "${team.name}"`,
        { inviteeEmail: email, teamId }
      );
    } catch (logError) {
      console.error('Failed to log team invitation activity:', logError);
    }
    
    res.status(200).json({
      success: true,
      message: 'User invited successfully'
    });
  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while inviting the user'
    });
  }
};


const addTeamMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const { members } = req.body;

    // Validate input
    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one member email or ID'
      });
    }

    // Find the team
    const team = await Team.findById(id);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    if (team.owner.toString() !== req.user.id && 
        !team.admins.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to add members to this team'
      });
    }

    const results = {
      success: [],
      failed: []
    };

    for (const member of members) {
      const query = mongoose.Types.ObjectId.isValid(member) 
        ? { _id: member } 
        : { email: member };
        
      const user = await User.findOne(query);

      if (!user) {
        results.failed.push({
          value: member,
          reason: 'User not found'
        });
        continue;
      }

      // Check if user is already a member
      if (team.members.includes(user._id)) {
        results.failed.push({
          value: member,
          userId: user._id,
          reason: 'User is already a member'
        });
        continue;
      }

      // Add user to team
      team.members.push(user._id);
      
      // Add team to user's teams if needed
      if (user.teams && !user.teams.includes(team._id)) {
        user.teams.push(team._id);
        await user.save();
      }

      results.success.push({
        userId: user._id,
        email: user.email,
        name: user.name || user.username
      });
    }

    // Save team if any members were added
    if (results.success.length > 0) {
      await team.save();
    }

    return res.status(200).json({
      success: true,
      message: `Added ${results.success.length} members to team`,
      results
    });
  } catch (error) {
    console.error('Error adding team members:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Add members to a board
 * @route POST /api/boards/:boardId/members
 */
const addBoardMembers = async (req, res) => {
  try {
    const { boardId } = req.params;
    const { members } = req.body;

    // Validate input
    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one member email or ID'
      });
    }

    // Find the board
    const board = await Board.findById(boardId);

    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }

    // Check if current user has permission to add members
    if (board.owner.toString() !== req.user.id && 
        !board.members.some(m => m.userId.toString() === req.user.id && m.role === 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to add members to this board'
      });
    }

    // Process each member
    const results = {
      success: [],
      failed: []
    };

    for (const member of members) {
      // Find user by email or ID
      const query = mongoose.Types.ObjectId.isValid(member) 
        ? { _id: member } 
        : { email: member };
        
      const user = await User.findOne(query);

      if (!user) {
        results.failed.push({
          value: member,
          reason: 'User not found'
        });
        continue;
      }

      // Check if user is already a member
      if (board.members.some(m => m.userId.toString() === user._id.toString())) {
        results.failed.push({
          value: member,
          userId: user._id,
          reason: 'User is already a member'
        });
        continue;
      }

      // Add user to board with 'viewer' role by default
      board.members.push({
        userId: user._id,
        role: 'viewer'
      });

      results.success.push({
        userId: user._id,
        email: user.email,
        name: user.name || user.username,
        role: 'viewer'
      });
    }

    if (results.success.length > 0) {
      await board.save();
    }

    return res.status(200).json({
      success: true,
      message: `Added ${results.success.length} members to board`,
      results
    });
  } catch (error) {
    console.error('Error adding board members:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all teams for the current user
 * @route GET /api/teams
 * @access Private
 */
const getUserTeams = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Debug logging
    console.log(`Searching for teams for user: ${userId}`);
    
    // Find teams where the user is owner, admin, or member
    const teams = await Team.find({
      $or: [
        { owner: userId },
        { admins: userId },
        { members: { $elemMatch: { user: userId } } }
      ]
    })
    .populate('owner', 'name username avatar')
    .populate('admins', 'name username avatar')
    .populate('members.user', 'name username avatar');
    
    // Debug logging
    console.log(`Found ${teams.length} teams for user ${userId}`);
    
    return res.status(200).json({
      success: true,
      count: teams.length,
      data: teams
    });
  } catch (error) {
    console.error('Get user teams error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching teams',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createTeam,
  getTeams,
  getTeamById,
  updateTeam,
  deleteTeam,
  addMember,
  removeMember,
  changeRole,
  transferOwnership,
  checkTeamExists,
  getTeamMembers,
  searchTeams,
  inviteUser,
  addTeamMembers,
  addBoardMembers,
  getUserTeams
};