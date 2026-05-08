import { Request, Response, NextFunction } from 'express';
import { isMongoConnected } from '../config/db';

/**
 * Middleware to check database connection before processing requests
 */
export const checkDatabaseConnection = (req: Request, res: Response, next: NextFunction): void => {
  if (!isMongoConnected()) {
    res.status(503).json({
      success: false,
      message: 'Database service unavailable',
      retryAfter: 30, // Suggest retry after 30 seconds
      code: 'DB_CONNECTION_ERROR'
    });
    return;
  }
  next();
};
