import { Request, Response, NextFunction } from 'express';
import Tenant from '../models/Tenant';

/**
 * Resolves the active tenant for the request and attaches it to req.tenant.
 *
 * Resolution order:
 *   1. x-tenant-id header (MongoDB ObjectId)
 *   2. x-tenant-slug header (URL-safe slug)
 *   3. req.user.currentTenant (last-switched tenant stored on the user)
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
      tenant = await Tenant.findById(tenantId).lean() as Record<string, unknown> | null;
    } else if (tenantSlug) {
      tenant = await Tenant.findOne({ slug: tenantSlug }).lean() as Record<string, unknown> | null;
    } else if (req.user?.currentTenant) {
      tenant = await Tenant.findById(req.user.currentTenant).lean() as Record<string, unknown> | null;
    }

    if (!tenant) {
      res.status(400).json({
        success: false,
        message: 'Tenant context required. Provide x-tenant-id or x-tenant-slug header, or switch to a workspace first.'
      });
      return;
    }

    const status = tenant.status as string;

    if (status === 'deleted') {
      res.status(404).json({ success: false, message: 'Organization not found.' });
      return;
    }

    if (status === 'suspended') {
      res.status(403).json({ success: false, message: 'This organization has been suspended.' });
      return;
    }

    const members = tenant.members as Array<{ user: { toString(): string }; status: string; role: string }>;
    const owner = tenant.owner as { toString(): string };
    const userId = req.user!.id;

    const isOwner = owner.toString() === userId;
    const member = members.find(m => m.user.toString() === userId);
    const isActiveMember = member?.status === 'active';

    if (!isOwner && !isActiveMember) {
      res.status(403).json({ success: false, message: 'You are not a member of this organization.' });
      return;
    }

    req.tenant = tenant;
    req.tenantId = (tenant._id as import('mongoose').Types.ObjectId);
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
 * requireTenantRole(...roles) — gate a route to specific tenant roles.
 * Must be used after resolveTenant.
 *
 * Example: requireTenantRole('owner', 'admin')
 */
export const requireTenantRole = (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const role = req.tenantMember?.role;
    if (role && roles.includes(role)) {
      next();
      return;
    }
    res.status(403).json({
      success: false,
      message: `This action requires one of the following roles: ${roles.join(', ')}.`
    });
  };

/** Shorthand: admin or owner */
export const requireTenantAdmin = requireTenantRole('owner', 'admin');

/** Shorthand: owner only */
export const requireTenantOwner = requireTenantRole('owner');
