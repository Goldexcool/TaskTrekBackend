import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Team from '../models/Team';
import Board from '../models/Board';
import User from '../models/User';
import { logTeamActivity } from '../services/activityService';
import Activity from '../models/Activity';
import Notification from '../models/Notification';

const createTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, members } = req.body as {
      name?: string;
      description?: string;
      members?: unknown;
    };

    if (!name) {
      res.status(400).json({ success: false, message: 'Team name is required' });
      return;
    }

    // Format members properly
    let formattedMembers: Array<{ user: string; role: string }> = [];

    if (members) {
      if (typeof members === 'string') {
        try {
          const parsedMembers = JSON.parse(members) as unknown[];
          if (Array.isArray(parsedMembers)) {
            formattedMembers = parsedMembers.map((m: unknown) => {
              const member = m as Record<string, unknown>;
              return { user: member.user as string, role: (member.role as string) || 'viewer' };
            });
          }
        } catch (e) {
          console.error('Failed to parse members JSON:', e);
        }
      } else if (Array.isArray(members)) {
        formattedMembers = (members as unknown[])
          .map((m: unknown) => {
            if (typeof m === 'string') {
              return { user: m, role: 'viewer' };
            } else if (m && (m as Record<string, unknown>).user) {
              const member = m as Record<string, unknown>;
              return { user: member.user as string, role: (member.role as string) || 'viewer' };
            }
            return null;
          })
          .filter((m): m is { user: string; role: string } => m !== null);
      }
    }

    // Make sure owner is included as a member with admin role
    const ownerInMembers = formattedMembers.some(m => m.user.toString() === req.user!.id);

    if (!ownerInMembers) {
      formattedMembers.push({ user: req.user!.id, role: 'admin' });
    }

    // Create team
    const team = await Team.create({
      name,
      description: description || '',
      owner: req.user!.id,
      members: formattedMembers,
      ...(req.tenantId && { tenant: req.tenantId })
    });

    // Populate team data
    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'name username avatar')
      .populate('members.user', 'name username avatar email');

    try {
      await logTeamActivity(req.user!.id, 'created_team', team._id, { teamName: team.name });
    } catch (logError) {
      console.error('Failed to log team activity:', logError);
    }

    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      data: populatedTeam
    });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating team',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

const getTeams = async (req: Request, res: Response): Promise<void> => {
  try {
    const teamQuery: Record<string, unknown> = {
      members: { $elemMatch: { user: req.user!.id } },
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
      message: (error as Error).message || 'An error occurred while fetching teams'
    });
  }
};

const getTeamById = async (req: Request, res: Response): Promise<void> => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('owner', 'username email')
      .populate('members.user', 'username email');

    if (!team) {
      res.status(404).json({ success: false, message: 'Team not found' });
      return;
    }

    // Check if user is a member of the team
    if (
      !team.members.some(
        member => (member.user as unknown as { _id: { toString(): string } })._id.toString() === req.user!.id
      )
    ) {
      res.status(403).json({
        success: false,
        message: 'You are not authorized to access this team'
      });
      return;
    }

    res.status(200).json({ success: true, data: team });
  } catch (error) {
    console.error('Get team by ID error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'An error occurred while fetching the team'
    });
  }
};

const updateTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description } = req.body as { name?: string; description?: string };

    const team = await Team.findById(id);

    if (!team) {
      res.status(404).json({ success: false, message: 'Team not found' });
      return;
    }

    if (
      team.owner.toString() !== req.user!.id &&
      !team.admins.map(a => a.toString()).includes(req.user!.id)
    ) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to update this team'
      });
      return;
    }

    if (name) team.name = name;
    if (description !== undefined) team.description = description;

    await team.save();

    res.status(200).json({
      success: true,
      message: 'Team updated successfully',
      data: team
    });
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

const deleteTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const team = await Team.findById(req.params.id);

    if (!team) {
      res.status(404).json({ success: false, message: 'Team not found' });
      return;
    }

    if (team.owner.toString() !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this team'
      });
      return;
    }

    await User.updateMany({ teams: team._id }, { $pull: { teams: team._id } });

    await team.deleteOne();

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'An error occurred while deleting the team'
    });
  }
};

// Add member to team
const addMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { email, role } = req.body as { email?: string; role?: string };

    if (!email) {
      res.status(400).json({ success: false, message: 'Email is required' });
      return;
    }

    const team = await Team.findById(id);
    if (!team) {
      res.status(404).json({ success: false, message: 'Team not found' });
      return;
    }

    if (team.owner.toString() !== req.user!.id) {
      const isAdmin = team.members.some(
        member =>
          member.user &&
          member.user.toString() === req.user!.id &&
          member.role === 'admin'
      );

      if (!isAdmin) {
        res.status(403).json({
          success: false,
          message: 'You are not authorized to add members to this team'
        });
        return;
      }
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ success: false, message: 'User with that email not found' });
      return;
    }

    const isMember = team.members.some(
      member => member.user && member.user.toString() === user._id.toString()
    );

    if (isMember) {
      res.status(400).json({ success: false, message: 'User is already a member of this team' });
      return;
    }

    team.members.push({ user: user._id, role: (role as 'admin' | 'member' | 'viewer') || 'viewer' });

    await team.save();

    const updatedTeam = await Team.findById(id)
      .populate('owner', 'name username avatar')
      .populate('members.user', 'name username avatar email');

    try {
      await Activity.create({
        user: req.user!.id,
        action: 'added_member',
        teamId: team._id,
        description: `Added a member to team "${team.name}"`,
        metadata: { teamName: team.name, memberEmail: email, memberRole: role || 'viewer' }
      });
    } catch (activityError) {
      console.error('Failed to log team activity:', activityError);
    }

    try {
      await Notification.create({
        recipient: user._id,
        type: 'team_invitation',
        message: `You have been added to the team "${team.name}"`,
        initiator: req.user!.id,
        relatedTeam: team._id
      });
    } catch (notifError) {
      console.error('Failed to create notification:', notifError);
    }

    res.status(200).json({
      success: true,
      message: 'Member added successfully',
      data: updatedTeam
    });
  } catch (error) {
    console.error('Add team member error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding team member',
      error: (error as Error).message
    });
  }
};

const removeMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, userId } = req.params;

    const team = await Team.findById(id);

    if (!team) {
      res.status(404).json({ success: false, message: 'Team not found' });
      return;
    }

    if (team.owner.toString() !== req.user!.id) {
      res.status(403).json({ success: false, message: 'Only the team owner can remove members' });
      return;
    }

    if (team.owner.toString() === userId) {
      res.status(400).json({ success: false, message: 'Cannot remove the team owner' });
      return;
    }

    if (!team.members.some(member => member.user.toString() === userId)) {
      res.status(400).json({ success: false, message: 'User is not a member of this team' });
      return;
    }

    team.members = team.members.filter(member => member.user.toString() !== userId);
    await team.save();

    await User.findByIdAndUpdate(userId, { $pull: { teams: team._id } });

    res.status(200).json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'An error occurred while removing the member'
    });
  }
};

const changeRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body as { role?: string };

    if (!role || !['admin', 'member'].includes(role)) {
      res.status(400).json({
        success: false,
        message: 'Please provide a valid role (admin or member)'
      });
      return;
    }

    const team = await Team.findById(id);

    if (!team) {
      res.status(404).json({ success: false, message: 'Team not found' });
      return;
    }

    const currentUserMember = team.members.find(
      member => member.user.toString() === req.user!.id
    );

    if (!currentUserMember || currentUserMember.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only team admins can change roles' });
      return;
    }

    const targetMemberIndex = team.members.findIndex(
      member => member.user.toString() === userId
    );

    if (targetMemberIndex === -1) {
      res.status(404).json({ success: false, message: 'User is not a member of this team' });
      return;
    }

    if (userId === req.user!.id && role === 'member') {
      const otherAdmins = team.members.filter(
        member => member.role === 'admin' && member.user.toString() !== req.user!.id
      );

      if (otherAdmins.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Cannot change role: The team needs at least one admin'
        });
        return;
      }
    }

    team.members[targetMemberIndex].role = role as 'admin' | 'member' | 'viewer';
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
      team.owner = (new (mongoose.Types.ObjectId as unknown as new (id: string) => mongoose.Types.ObjectId)(String(userId)));
      await team.save();
    }

    res.status(200).json({
      success: true,
      message: `Role updated successfully to ${role}`,
      data: { teamId: team._id, userId, newRole: role, owner: team.owner }
    });
  } catch (error) {
    console.error('Change role error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'An error occurred while changing the role'
    });
  }
};

const transferOwnership = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { userId } = req.body as { userId?: string };

    if (!userId) {
      res.status(400).json({
        success: false,
        message: 'Please provide the user ID to transfer ownership to'
      });
      return;
    }

    const team = await Team.findById(id);

    if (!team) {
      res.status(404).json({ success: false, message: 'Team not found' });
      return;
    }

    if (team.owner.toString() !== req.user!.id) {
      res.status(403).json({ success: false, message: 'Only the team owner can transfer ownership' });
      return;
    }

    const targetMemberIndex = team.members.findIndex(
      member => member.user.toString() === userId
    );

    if (targetMemberIndex === -1) {
      res.status(404).json({ success: false, message: 'User is not a member of this team' });
      return;
    }

    team.members[targetMemberIndex].role = 'admin';
    team.owner = (new (mongoose.Types.ObjectId as unknown as new (id: string) => mongoose.Types.ObjectId)(userId));

    await team.save();

    res.status(200).json({
      success: true,
      message: 'Team ownership transferred successfully',
      data: { teamId: team._id, newOwner: userId }
    });
  } catch (error) {
    console.error('Transfer ownership error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'An error occurred while transferring ownership'
    });
  }
};

const checkTeamExists = async (req: Request, res: Response): Promise<void> => {
  try {
    const { teamId } = req.params;

    if (!String(teamId).match(/^[0-9a-fA-F]{24}$/)) {
      res.status(200).json({ success: true, exists: false, message: 'Invalid team ID format' });
      return;
    }

    const team = await Team.findById(teamId).select('name');

    if (!team) {
      res.status(200).json({ success: true, exists: false, message: 'Team not found' });
      return;
    }

    res.status(200).json({
      success: true,
      exists: true,
      team: { id: team._id, name: team.name }
    });
  } catch (error) {
    console.error('Check team exists error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'An error occurred while checking if team exists'
    });
  }
};

const getTeamMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const team = await Team.findById(id).populate({
      path: 'members.user',
      select: 'username email name avatar'
    });

    if (!team) {
      res.status(404).json({ success: false, message: 'Team not found' });
      return;
    }

    const isMember = team.members.some(member => {
      const memberUser = member.user as unknown as { _id: { toString(): string } };
      return memberUser._id.toString() === req.user!.id;
    });

    if (!isMember) {
      res.status(403).json({ success: false, message: 'You are not a member of this team' });
      return;
    }

    const members = team.members.map(member => {
      const memberUser = member.user as unknown as {
        _id: { toString(): string };
        username: string;
        email: string;
        name: string;
        avatar: string;
      };
      return {
        id: memberUser._id,
        username: memberUser.username,
        email: memberUser.email,
        name: memberUser.name,
        avatar: memberUser.avatar,
        role: member.role,
        joinedAt: member.joinedAt,
        isOwner: team.owner.toString() === memberUser._id.toString()
      };
    });

    res.status(200).json({ success: true, count: members.length, data: members });
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'An error occurred while fetching team members'
    });
  }
};

const searchTeams = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.query as { query?: string };

    if (!query) {
      res.status(400).json({ success: false, message: 'Please provide a search query' });
      return;
    }

    const user = await User.findById(req.user!.id).populate('teams');
    const userTeamIds = (user!.teams as unknown as Array<{ _id: unknown }>).map(team => team._id);

    const teams = await Team.find({
      _id: { $in: userTeamIds },
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    })
      .select('name description owner members createdAt')
      .populate('owner', 'username email name avatar');

    const formattedTeams = teams.map(team => {
      const owner = team.owner as unknown as {
        _id: { toString(): string };
        username: string;
        name: string;
        avatar: string;
      };
      return {
        id: team._id,
        name: team.name,
        description: team.description,
        owner: {
          id: owner._id,
          username: owner.username,
          name: owner.name || owner.username,
          avatar: owner.avatar
        },
        memberCount: team.members.length,
        createdAt: (team as unknown as Record<string, unknown>).createdAt,
        isOwner: owner._id.toString() === req.user!.id
      };
    });

    res.status(200).json({ success: true, count: formattedTeams.length, data: formattedTeams });
  } catch (error) {
    console.error('Team search error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'An error occurred while searching for teams'
    });
  }
};

const inviteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, teamId } = req.body as { email?: string; teamId?: string };

    const team = await Team.findById(teamId);
    const targetUser = await User.findOne({ email });

    if (!team) {
      res.status(404).json({ success: false, message: 'Team not found' });
      return;
    }

    if (!targetUser) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    try {
      await logTeamActivity(req.user!.id, 'added_member', team._id, { inviteeEmail: email, teamId });
    } catch (logError) {
      console.error('Failed to log team invitation activity:', logError);
    }

    res.status(200).json({ success: true, message: 'User invited successfully' });
  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'An error occurred while inviting the user'
    });
  }
};

const addTeamMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { members } = req.body as { members?: unknown[] };

    if (!members || !Array.isArray(members) || members.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Please provide at least one member email or ID'
      });
      return;
    }

    const team = await Team.findById(id);

    if (!team) {
      res.status(404).json({ success: false, message: 'Team not found' });
      return;
    }

    if (
      team.owner.toString() !== req.user!.id &&
      !team.admins.map(a => a.toString()).includes(req.user!.id)
    ) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to add members to this team'
      });
      return;
    }

    const results: {
      success: Array<{ userId: unknown; email: string; name: string }>;
      failed: Array<{ value: unknown; userId?: unknown; reason: string }>;
    } = { success: [], failed: [] };

    for (const member of members) {
      const memberStr = member as string;
      const query = mongoose.isValidObjectId(memberStr)
        ? { _id: memberStr }
        : { email: memberStr };

      const user = await User.findOne(query);

      if (!user) {
        results.failed.push({ value: member, reason: 'User not found' });
        continue;
      }

      if (team.members.some(m => m.user.toString() === user._id.toString())) {
        results.failed.push({ value: member, userId: user._id, reason: 'User is already a member' });
        continue;
      }

      team.members.push({ user: user._id, role: 'viewer' });

      if (user.teams && !user.teams.map(t => t.toString()).includes(team._id.toString())) {
        user.teams.push(team._id);
        await user.save();
      }

      results.success.push({ userId: user._id, email: user.email, name: user.name || user.username });
    }

    if (results.success.length > 0) {
      await team.save();
    }

    res.status(200).json({
      success: true,
      message: `Added ${results.success.length} members to team`,
      results
    });
  } catch (error) {
    console.error('Error adding team members:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

const addBoardMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { boardId } = req.params;
    const { members } = req.body as { members?: unknown[] };

    if (!members || !Array.isArray(members) || members.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Please provide at least one member email or ID'
      });
      return;
    }

    const board = await Board.findById(boardId);

    if (!board) {
      res.status(404).json({ success: false, message: 'Board not found' });
      return;
    }

    const results: {
      success: Array<{ userId: unknown; email: string; name: string; role: string }>;
      failed: Array<{ value: unknown; userId?: unknown; reason: string }>;
    } = { success: [], failed: [] };

    for (const member of members) {
      const memberStr = member as string;
      const query = mongoose.isValidObjectId(memberStr)
        ? { _id: memberStr }
        : { email: memberStr };

      const user = await User.findOne(query);

      if (!user) {
        results.failed.push({ value: member, reason: 'User not found' });
        continue;
      }

      if (board.members.some(m => m.user && m.user.toString() === user._id.toString())) {
        results.failed.push({ value: member, userId: user._id, reason: 'User is already a member' });
        continue;
      }

      board.members.push({ user: user._id, role: 'viewer' });

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

    res.status(200).json({
      success: true,
      message: `Added ${results.success.length} members to board`,
      results
    });
  } catch (error) {
    console.error('Error adding board members:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

const getUserTeams = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    console.log(`Searching for teams for user: ${userId}`);

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

    console.log(`Found ${teams.length} teams for user ${userId}`);

    res.status(200).json({ success: true, count: teams.length, data: teams });
  } catch (error) {
    console.error('Get user teams error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching teams',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

export {
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
