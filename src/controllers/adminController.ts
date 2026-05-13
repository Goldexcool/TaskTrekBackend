import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import Tenant from '../models/Tenant';
import Team from '../models/Team';
import Board from '../models/Board';
import Task from '../models/Task';

// GET /api/admin/stats
export const getPlatformStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const [users, tenants, teams, boards, tasks] = await Promise.all([
      User.countDocuments(),
      Tenant.countDocuments({ status: 'active' }),
      Team.countDocuments(),
      Board.countDocuments(),
      Task.countDocuments()
    ]);

    res.status(200).json({
      success: true,
      data: { users, tenants, teams, boards, tasks }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// GET /api/admin/users?page=1&limit=20&search=
export const listUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const search = (req.query.search as string)?.trim();

    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -refreshToken -verificationCode -resetPasswordToken')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// GET /api/admin/users/:userId
export const getUserDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password -refreshToken -verificationCode -resetPasswordToken')
      .populate('currentTenant', 'name slug')
      .lean();

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const [tenants, teams, tasks] = await Promise.all([
      Tenant.find({ 'members.user': user._id }).select('name slug status').lean(),
      Team.find({ 'members.user': user._id }).select('name').lean(),
      Task.countDocuments({ assignedTo: user._id })
    ]);

    res.status(200).json({
      success: true,
      data: { ...user, tenants, teams, tasksAssigned: tasks }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// PATCH /api/admin/users/:userId/role
export const updateUserRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { role } = req.body as { role?: string };

    if (!role || !['user', 'admin'].includes(role)) {
      res.status(400).json({ success: false, message: 'role must be "user" or "admin"' });
      return;
    }

    if (req.params.userId === req.user?.id) {
      res.status(400).json({ success: false, message: 'Cannot change your own role' });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { role: role as 'user' | 'admin' },
      { new: true }
    ).select('-password -refreshToken');

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// DELETE /api/admin/users/:userId
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.params.userId === req.user?.id) {
      res.status(400).json({ success: false, message: 'Cannot delete your own account' });
      return;
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Remove from all tenant member lists
    await Tenant.updateMany(
      { 'members.user': user._id },
      { $pull: { members: { user: user._id } } }
    );

    // Remove from all team member lists
    await Team.updateMany(
      { 'members.user': user._id },
      { $pull: { members: { user: user._id } } }
    );

    await User.findByIdAndDelete(req.params.userId);

    res.status(200).json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// GET /api/admin/tenants?page=1&limit=20&search=
export const listTenants = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const search = (req.query.search as string)?.trim();

    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } }
      ];
    }

    const [tenants, total] = await Promise.all([
      Tenant.find(filter)
        .populate('owner', 'name email username')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Tenant.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: tenants,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// GET /api/admin/tenants/:tenantId
export const getTenantDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenant = await Tenant.findById(req.params.tenantId)
      .populate('owner', 'name email username')
      .populate('members.user', 'name email username')
      .lean();

    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }

    const [teams, boards, tasks] = await Promise.all([
      Team.countDocuments({ tenant: tenant._id }),
      Board.countDocuments({ tenant: tenant._id }),
      Task.countDocuments({ tenant: tenant._id })
    ]);

    res.status(200).json({
      success: true,
      data: { ...tenant, stats: { teams, boards, tasks } }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// PATCH /api/admin/tenants/:tenantId/status
export const updateTenantStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.body as { status?: string };

    if (!status || !['active', 'suspended', 'deleted'].includes(status)) {
      res.status(400).json({
        success: false,
        message: 'status must be "active", "suspended", or "deleted"'
      });
      return;
    }

    const tenant = await Tenant.findByIdAndUpdate(
      req.params.tenantId,
      { status: status as 'active' | 'suspended' | 'deleted' },
      { new: true }
    );

    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }

    res.status(200).json({ success: true, data: tenant });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};
