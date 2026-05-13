import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

export const errorHandler = (
  err: Error & { code?: number; keyValue?: Record<string, unknown>; path?: string; value?: unknown },
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  let message = err.message || 'Server error';

  // Mongoose bad ObjectId
  if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ID format: ${err.value}`;
  }

  // Mongoose duplicate key
  if (err.code === 11000 && err.keyValue) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
  }

  // JWT expired
  if (err instanceof TokenExpiredError) {
    statusCode = 401;
    message = 'Token has expired. Please log in again.';
  }

  // JWT invalid
  if (err instanceof JsonWebTokenError) {
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};
