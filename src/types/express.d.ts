import { Types } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email?: string; currentTenant?: string; role?: string };
      tenant?: Record<string, unknown>;
      tenantId?: Types.ObjectId;
      tenantMember?: { role: string; status: string };
    }
  }
}

export {};
