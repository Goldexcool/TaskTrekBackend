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

    if (!name || !name.trim()) {
      res.status(400).json({ success: false, message: 'Organization name is required.' });
      return;
    }

    const tenant = await Tenant.create({
      name: name.trim(),
      description,
      logo,
      owner: req.user!.id,
      members: [{ user: req.user!.id, role: 'owner', status: 'active', joinedAt: new Date() }]
    });

    // Sync User.tenants and set currentTenant
    await User.findByIdAndUpdate(req.user!.id, {
      currentTenant: tenant._id,
      $push: {
        tenants: { tenant: tenant._id, role: 'owner', status: 'active', joinedAt: new Date() }
      }
    });

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
    if (!mongoose.isValidObjectId(req.params.tenantId)) {
      res.status(400).json({ success: false, message: 'Invalid tenant ID.' });
      return;
    }

    const tenant = await Tenant.findOne({
      _id: req.params.tenantId,
      status: { $ne: 'deleted' }
    }).lean() as (Record<string, unknown> & {
      owner: { toString(): string };
      members: Array<{ user: { toString(): string }; status: string }>;
      status: string;
    }) | null;

    if (!tenant) {
      res.status(404).json({ success: false, message: 'Organization not found.' });
      return;
    }

    if (tenant.status === 'suspended') {
      res.status(403).json({ success: false, message: 'This organization has been suspended.' });
      return;
    }

    const userId = req.user!.id;
    const isOwner = tenant.owner.toString() === userId;
    const isActiveMember = tenant.members.some(m => m.user.toString() === userId && m.status === 'active');

    if (!isOwner && !isActiveMember) {
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

const getMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantDoc = req.tenant as Record<string, unknown> & { _id: unknown };
    const tenant = await Tenant.findById(tenantDoc._id)
      .populate('members.user', 'name username email')
      .lean();

    if (!tenant) {
      res.status(404).json({ success: false, message: 'Organization not found.' });
      return;
    }

    res.status(200).json({ success: true, data: tenant.members });
  } catch (error) {
    console.error('getMembers error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
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
      res.status(400).json({ success: false, message: 'Invalid role. Must be admin, member, or viewer.' });
      return;
    }

    if (!userId && !email) {
      res.status(400).json({ success: false, message: 'Provide either userId or email.' });
      return;
    }

    const targetUser = userId
      ? await User.findById(userId)
      : await User.findOne({ email: email!.toLowerCase() });

    if (!targetUser) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    const tenantDoc = req.tenant as Record<string, unknown> & { _id: mongoose.Types.ObjectId };
    const tenant = await Tenant.findById(tenantDoc._id);
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found.' });
      return;
    }

    const existing = tenant.members.find(m => m.user.toString() === targetUser._id.toString());
    if (existing) {
      if (existing.status === 'active') {
        res.status(400).json({ success: false, message: 'User is already a member of this organization.' });
        return;
      }
      // Reactivate previously removed member
      existing.status = 'active';
      existing.role = role as 'admin' | 'member' | 'viewer';
      existing.joinedAt = new Date();
    } else {
      tenant.members.push({
        user: targetUser._id as mongoose.Types.ObjectId,
        role: role as 'admin' | 'member' | 'viewer',
        status: 'active',
        joinedAt: new Date()
      });
    }

    await tenant.save();

    // Sync User.tenants
    await User.findByIdAndUpdate(targetUser._id, {
      $pull: { tenants: { tenant: tenantDoc._id } }
    });
    await User.findByIdAndUpdate(targetUser._id, {
      $push: { tenants: { tenant: tenantDoc._id, role, status: 'active', joinedAt: new Date() } }
    });

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
      res.status(400).json({ success: false, message: 'Invalid role. Must be admin, member, or viewer.' });
      return;
    }

    if (!mongoose.isValidObjectId(userId)) {
      res.status(400).json({ success: false, message: 'Invalid user ID.' });
      return;
    }

    const tenantDoc = req.tenant as Record<string, unknown> & { _id: mongoose.Types.ObjectId };
    const tenant = await Tenant.findById(tenantDoc._id);
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found.' });
      return;
    }

    if (tenant.owner.toString() === userId) {
      res.status(400).json({ success: false, message: 'Cannot change the role of the tenant owner.' });
      return;
    }

    const member = tenant.members.find(m => m.user.toString() === userId);
    if (!member) {
      res.status(404).json({ success: false, message: 'Member not found.' });
      return;
    }

    member.role = role as 'admin' | 'member' | 'viewer';
    await tenant.save();

    // Sync User.tenants
    await User.findOneAndUpdate(
      { _id: userId, 'tenants.tenant': tenantDoc._id },
      { $set: { 'tenants.$.role': role } }
    );

    res.status(200).json({ success: true, message: 'Member role updated.', data: tenant.members });
  } catch (error) {
    console.error('updateMemberRole error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

const removeMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      res.status(400).json({ success: false, message: 'Invalid user ID.' });
      return;
    }

    const tenantDoc = req.tenant as Record<string, unknown> & { _id: mongoose.Types.ObjectId };
    const tenant = await Tenant.findById(tenantDoc._id);
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found.' });
      return;
    }

    if (tenant.owner.toString() === userId) {
      res.status(400).json({ success: false, message: 'Cannot remove the tenant owner.' });
      return;
    }

    const memberIndex = tenant.members.findIndex(m => m.user.toString() === userId);
    if (memberIndex === -1) {
      res.status(404).json({ success: false, message: 'Member not found.' });
      return;
    }

    tenant.members.splice(memberIndex, 1);
    await tenant.save();

    // Clear currentTenant on user if it was this tenant, and mark removed in User.tenants
    await User.findOneAndUpdate(
      { _id: userId, 'tenants.tenant': tenantDoc._id },
      { $set: { 'tenants.$.status': 'removed' } }
    );
    await User.findOneAndUpdate(
      { _id: userId, currentTenant: tenantDoc._id },
      { $set: { currentTenant: null } }
    );

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
