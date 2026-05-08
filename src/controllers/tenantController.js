const Tenant = require('../models/Tenant');
const User = require('../models/User');

// POST /api/tenants
const createTenant = async (req, res) => {
  try {
    const { name, description, logo } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Organization name is required.' });
    }

    const tenant = await Tenant.create({
      name,
      description,
      logo,
      owner: req.user.id,
      members: [{
        user: req.user.id,
        role: 'owner',
        status: 'active',
        joinedAt: new Date()
      }]
    });

    // Set as the creator's current tenant
    await User.findByIdAndUpdate(req.user.id, { currentTenant: tenant._id });

    return res.status(201).json({ success: true, message: 'Organization created.', data: tenant });
  } catch (error) {
    console.error('createTenant error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/tenants  — tenants the caller belongs to
const getMyTenants = async (req, res) => {
  try {
    const tenants = await Tenant.find({
      'members.user': req.user.id,
      'members.status': 'active',
      status: 'active'
    }).lean();

    return res.status(200).json({ success: true, data: tenants });
  } catch (error) {
    console.error('getMyTenants error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/tenants/current  — returns the tenant from resolved context
const getCurrentTenant = (req, res) => {
  return res.status(200).json({ success: true, data: req.tenant });
};

// GET /api/tenants/:tenantId
const getTenantById = async (req, res) => {
  try {
    const tenant = await Tenant.findOne({
      _id: req.params.tenantId,
      status: 'active'
    }).lean();

    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Organization not found.' });
    }

    // Caller must be a member
    const isMember = tenant.members.some(
      m => m.user.toString() === req.user.id.toString() && m.status === 'active'
    );
    const isOwner = tenant.owner.toString() === req.user.id.toString();

    if (!isMember && !isOwner) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.status(200).json({ success: true, data: tenant });
  } catch (error) {
    console.error('getTenantById error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/tenants/:tenantId  — admin/owner only (enforced by middleware)
const updateTenant = async (req, res) => {
  try {
    const { name, description, logo, settings } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (logo !== undefined) updates.logo = logo;
    if (settings !== undefined) updates.settings = settings;

    const tenant = await Tenant.findByIdAndUpdate(
      req.tenant._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    return res.status(200).json({ success: true, message: 'Organization updated.', data: tenant });
  } catch (error) {
    console.error('updateTenant error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/tenants/:tenantId  — owner only (enforced by middleware)
const deleteTenant = async (req, res) => {
  try {
    await Tenant.findByIdAndUpdate(req.tenant._id, { status: 'deleted' });
    return res.status(200).json({ success: true, message: 'Organization deleted.' });
  } catch (error) {
    console.error('deleteTenant error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/tenants/:tenantId/members
const getMembers = (req, res) => {
  return res.status(200).json({ success: true, data: req.tenant.members });
};

// POST /api/tenants/:tenantId/members  — admin/owner only
const addMember = async (req, res) => {
  try {
    const { userId, email, role = 'member' } = req.body;
    const validRoles = ['admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role. Must be admin, member, or viewer.' });
    }

    let user = null;
    if (userId) {
      user = await User.findById(userId).lean();
    } else if (email) {
      user = await User.findOne({ email: email.toLowerCase() }).lean();
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const tenant = await Tenant.findById(req.tenant._id);
    const existing = tenant.members.find(m => m.user.toString() === user._id.toString());
    if (existing) {
      return res.status(400).json({ success: false, message: 'User is already a member of this organization.' });
    }

    tenant.members.push({
      user: user._id,
      role,
      status: 'active',
      joinedAt: new Date()
    });
    await tenant.save();

    return res.status(201).json({ success: true, message: 'Member added.', data: tenant.members });
  } catch (error) {
    console.error('addMember error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/tenants/:tenantId/members/:userId/role  — admin/owner only
const updateMemberRole = async (req, res) => {
  try {
    const { role } = req.body;
    const { userId } = req.params;
    const validRoles = ['admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    }

    const tenant = await Tenant.findById(req.tenant._id);

    // Prevent changing the owner's role
    if (tenant.owner.toString() === userId) {
      return res.status(400).json({ success: false, message: 'Cannot change the role of the tenant owner.' });
    }

    const member = tenant.members.find(m => m.user.toString() === userId);
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found.' });
    }

    member.role = role;
    await tenant.save();

    return res.status(200).json({ success: true, message: 'Member role updated.', data: tenant.members });
  } catch (error) {
    console.error('updateMemberRole error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/tenants/:tenantId/members/:userId  — admin/owner only
const removeMember = async (req, res) => {
  try {
    const { userId } = req.params;
    const tenant = await Tenant.findById(req.tenant._id);

    // Prevent removing the owner
    if (tenant.owner.toString() === userId) {
      return res.status(400).json({ success: false, message: 'Cannot remove the tenant owner.' });
    }

    const before = tenant.members.length;
    tenant.members = tenant.members.filter(m => m.user.toString() !== userId);

    if (tenant.members.length === before) {
      return res.status(404).json({ success: false, message: 'Member not found.' });
    }

    await tenant.save();
    return res.status(200).json({ success: true, message: 'Member removed.' });
  } catch (error) {
    console.error('removeMember error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/tenants/:tenantId/switch  — set as the caller's active tenant
const switchTenant = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { currentTenant: req.tenant._id });
    return res.status(200).json({
      success: true,
      message: `Switched to organization: ${req.tenant.name}`,
      data: { currentTenant: req.tenant._id }
    });
  } catch (error) {
    console.error('switchTenant error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
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
