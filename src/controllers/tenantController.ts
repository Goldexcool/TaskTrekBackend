import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tenant from '../models/Tenant';
import User from '../models/User';

const createTenant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, logo } = req.body as {
      name?: string;
      description?: string;
      logo?: string;
    };

    if (!name) {
      res.status(400).json({ success: false, message: 'Organization name is required.' });
      return;
    }

    const tenant = await Tenant.create({
      name,
      description,
      logo,
      owner: req.user!.id,
      members: [
        {
          user: req.user!.id,
          role: 'owner',
          status: 'active',
          joinedAt: new Date()
        }
      ]
    });

    await User.findByIdAndUpdate(req.user!.id, { currentTenant: tenant._id });

    res.status(201).json({ success: true, message: 'Organization created.', data: tenant });
  } catch (error) {
    console.error('createTenant error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

const getMyTenants = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenants = await Tenant.find({
      'members.user': req.user!.id,
      'members.status': 'active',
      status: 'active'
    }).lean();

    res.status(200).json({ success: true, data: tenants });
  } catch (error) {
    console.error('getMyTenants error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

const getCurrentTenant = (req: Request, res: Response): void => {
  res.status(200).json({ success: true, data: req.tenant });
};

const getTenantById = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenant = await Tenant.findOne({
      _id: req.params.tenantId,
      status: 'active'
    }).lean() as (Record<string, unknown> & {
      owner: { toString(): string };
      members: Array<{ user: { toString(): string }; status: string }>;
    }) | null;

    if (!tenant) {
      res.status(404).json({ success: false, message: 'Organization not found.' });
      return;
    }

    const userId = req.user!.id;
    const isMember = tenant.members.some(
      m => m.user.toString() === userId && m.status === 'active'
    );
    const isOwner = tenant.owner.toString() === userId;

    if (!isMember && !isOwner) {
      res.status(403).json({ success: false, message: 'Access denied.' });
      return;
    }

    res.status(200).json({ success: true, data: tenant });
  } catch (error) {
    console.error('getTenantById error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

const updateTenant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, logo, settings } = req.body as {
      name?: string;
      description?: string;
      logo?: string;
      settings?: Record<string, unknown>;
    };

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (logo !== undefined) updates.logo = logo;
    if (settings !== undefined) updates.settings = settings;

    const tenantDoc = req.tenant as Record<string, unknown> & { _id: unknown };

    const tenant = await Tenant.findByIdAndUpdate(
      tenantDoc._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, message: 'Organization updated.', data: tenant });
  } catch (error) {
    console.error('updateTenant error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

const deleteTenant = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantDoc = req.tenant as Record<string, unknown> & { _id: unknown };
    await Tenant.findByIdAndUpdate(tenantDoc._id, { status: 'deleted' });
    res.status(200).json({ success: true, message: 'Organization deleted.' });
  } catch (error) {
    console.error('deleteTenant error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

const getMembers = (req: Request, res: Response): void => {
  const tenantDoc = req.tenant as Record<string, unknown> & { members: unknown };
  res.status(200).json({ success: true, data: tenantDoc.members });
};

const addMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, email, role = 'member' } = req.body as {
      userId?: string;
      email?: string;
      role?: string;
    };

    const validRoles = ['admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      res.status(400).json({
        success: false,
        message: 'Invalid role. Must be admin, member, or viewer.'
      });
      return;
    }

    let user: (Record<string, unknown> & { _id: unknown }) | null = null;
    if (userId) {
      user = await User.findById(userId).lean() as (Record<string, unknown> & { _id: unknown }) | null;
    } else if (email) {
      user = await User.findOne({ email: email.toLowerCase() }).lean() as (Record<string, unknown> & { _id: unknown }) | null;
    }

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    const tenantDoc = req.tenant as Record<string, unknown> & { _id: unknown };
    const tenant = await Tenant.findById(tenantDoc._id);
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found.' });
      return;
    }

    const existing = tenant.members.find(m => m.user.toString() === (user!._id as { toString(): string }).toString());
    if (existing) {
      res.status(400).json({
        success: false,
        message: 'User is already a member of this organization.'
      });
      return;
    }

    tenant.members.push({
      user: user._id as import('mongoose').Types.ObjectId,
      role: role as 'admin' | 'member' | 'viewer',
      status: 'active',
      joinedAt: new Date()
    });
    await tenant.save();

    res.status(201).json({ success: true, message: 'Member added.', data: tenant.members });
  } catch (error) {
    console.error('addMember error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

const updateMemberRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { role } = req.body as { role?: string };
    const { userId } = req.params;

    const validRoles = ['admin', 'member', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      res.status(400).json({ success: false, message: 'Invalid role.' });
      return;
    }

    const tenantDoc = req.tenant as Record<string, unknown> & { _id: unknown };
    const tenant = await Tenant.findById(tenantDoc._id);
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found.' });
      return;
    }

    if (tenant.owner.toString() === userId) {
      res.status(400).json({
        success: false,
        message: 'Cannot change the role of the tenant owner.'
      });
      return;
    }

    const member = tenant.members.find(m => m.user.toString() === userId);
    if (!member) {
      res.status(404).json({ success: false, message: 'Member not found.' });
      return;
    }

    member.role = role as 'admin' | 'member' | 'viewer';
    await tenant.save();

    res.status(200).json({ success: true, message: 'Member role updated.', data: tenant.members });
  } catch (error) {
    console.error('updateMemberRole error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

const removeMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const tenantDoc = req.tenant as Record<string, unknown> & { _id: unknown };
    const tenant = await Tenant.findById(tenantDoc._id);
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found.' });
      return;
    }

    if (tenant.owner.toString() === userId) {
      res.status(400).json({ success: false, message: 'Cannot remove the tenant owner.' });
      return;
    }

    const before = tenant.members.length;
    tenant.members = tenant.members.filter(m => m.user.toString() !== userId);

    if (tenant.members.length === before) {
      res.status(404).json({ success: false, message: 'Member not found.' });
      return;
    }

    await tenant.save();
    res.status(200).json({ success: true, message: 'Member removed.' });
  } catch (error) {
    console.error('removeMember error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

const switchTenant = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantDoc = req.tenant as Record<string, unknown> & { _id: mongoose.Types.ObjectId; name: string };
    await User.findByIdAndUpdate(req.user!.id, { currentTenant: tenantDoc._id });
    res.status(200).json({
      success: true,
      message: `Switched to organization: ${tenantDoc.name}`,
      data: { currentTenant: tenantDoc._id }
    });
  } catch (error) {
    console.error('switchTenant error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

export {
  createTenant,
  getMyTenants,
  getCurrentTenant,
  getTenantById,
  updateTenant,
  deleteTenant,
  getMembers,
  addMember,
  updateMemberRole,
  removeMember,
  switchTenant
};
