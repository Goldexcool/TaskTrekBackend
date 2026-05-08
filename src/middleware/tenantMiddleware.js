const Tenant = require('../models/Tenant');

/**
 * Resolves the active tenant for the request and attaches it to req.tenant.
 * Also attaches req.tenantMember with the caller's role inside that tenant.
 *
 * Resolution order:
 *   1. x-tenant-id header (MongoDB ObjectId)
 *   2. x-tenant-slug header (URL-safe slug)
 *   3. req.user.currentTenant (last-switched tenant stored on the user)
 *
 * Call this middleware AFTER authenticateToken so req.user is available.
 */
const resolveTenant = async (req, res, next) => {
  try {
    const tenantId   = req.headers['x-tenant-id'];
    const tenantSlug = req.headers['x-tenant-slug'];

    let tenant = null;

    if (tenantId) {
      tenant = await Tenant.findOne({ _id: tenantId, status: 'active' }).lean();
    } else if (tenantSlug) {
      tenant = await Tenant.findOne({ slug: tenantSlug, status: 'active' }).lean();
    } else if (req.user && req.user.currentTenant) {
      tenant = await Tenant.findOne({ _id: req.user.currentTenant, status: 'active' }).lean();
    }

    if (!tenant) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context required. Provide x-tenant-id or x-tenant-slug header.'
      });
    }

    // Verify the caller is an active member of this tenant
    const member = tenant.members.find(
      m => m.user.toString() === req.user.id.toString() && m.status === 'active'
    );

    // The owner always has access even if not in the members array
    const isOwner = tenant.owner.toString() === req.user.id.toString();

    if (!member && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this organization.'
      });
    }

    req.tenant = tenant;
    req.tenantId = tenant._id;
    req.tenantMember = {
      role: isOwner ? 'owner' : member.role,
      status: isOwner ? 'active' : member.status
    };

    next();
  } catch (error) {
    console.error('Tenant resolution error:', error);
    res.status(500).json({ success: false, message: 'Server error resolving tenant context.' });
  }
};

/**
 * Require the caller to be a tenant admin or owner.
 * Must be used after resolveTenant.
 */
const requireTenantAdmin = (req, res, next) => {
  const role = req.tenantMember && req.tenantMember.role;
  if (role === 'owner' || role === 'admin') return next();
  return res.status(403).json({
    success: false,
    message: 'Tenant admin or owner privileges required.'
  });
};

/**
 * Require the caller to be the tenant owner.
 * Must be used after resolveTenant.
 */
const requireTenantOwner = (req, res, next) => {
  if (req.tenantMember && req.tenantMember.role === 'owner') return next();
  return res.status(403).json({
    success: false,
    message: 'Tenant owner privileges required.'
  });
};

module.exports = { resolveTenant, requireTenantAdmin, requireTenantOwner };
