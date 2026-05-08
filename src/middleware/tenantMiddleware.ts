import { Request, Response, NextFunction } from 'express';
import Tenant from '../models/Tenant';

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
export const resolveTenant = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string | undefined;
    const tenantSlug = req.headers['x-tenant-slug'] as string | undefined;

    let tenant: Record<string, unknown> | null = null;

    if (tenantId) {
      tenant = await Tenant.findOne({ _id: tenantId, status: 'active' }).lean() as Record<string, unknown> | null;
    } else if (tenantSlug) {
      tenant = await Tenant.findOne({ slug: tenantSlug, status: 'active' }).lean() as Record<string, unknown> | null;
    } else if (req.user && req.user.currentTenant) {
      tenant = await Tenant.findOne({ _id: req.user.currentTenant, status: 'active' }).lean() as Record<string, unknown> | null;
    }

    if (!tenant) {
      res.status(400).json({
        success: false,
        message: 'Tenant context required. Provide x-tenant-id or x-tenant-slug header.'
      });
      return;
    }

    const members = tenant.members as Array<{ user: { toString(): string }; status: string; role: string }>;
    const owner = tenant.owner as { toString(): string };
    const userId = req.user!.id;

    // Verify the caller is an active member of this tenant
    const member = members.find(
      m => m.user.toString() === userId.toString() && m.status === 'active'
    );

    // The owner always has access even if not in the members array
    const isOwner = owner.toString() === userId.toString();

    if (!member && !isOwner) {
      res.status(403).json({
        success: false,
        message: 'You are not a member of this organization.'
      });
      return;
    }

    req.tenant = tenant;
    req.tenantId = (tenant._id as { toString(): string }) as unknown as import('mongoose').Types.ObjectId;
    req.tenantMember = {
      role: isOwner ? 'owner' : member!.role,
      status: isOwner ? 'active' : member!.status
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
export const requireTenantAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const role = req.tenantMember && req.tenantMember.role;
  if (role === 'owner' || role === 'admin') {
    next();
    return;
  }
  res.status(403).json({
    success: false,
    message: 'Tenant admin or owner privileges required.'
  });
};

/**
 * Require the caller to be the tenant owner.
 * Must be used after resolveTenant.
 */
export const requireTenantOwner = (req: Request, res: Response, next: NextFunction): void => {
  if (req.tenantMember && req.tenantMember.role === 'owner') {
    next();
    return;
  }
  res.status(403).json({
    success: false,
    message: 'Tenant owner privileges required.'
  });
};
