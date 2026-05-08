import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
      return;
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is missing in environment variables!');
      res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
      return;
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error('Token verification failed:', err.message);
        res.status(403).json({
          success: false,
          message: 'Invalid or expired token'
        });
        return;
      }

      req.user = decoded as { id: string; email?: string; currentTenant?: string };
      next();
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: (error as Error).message
    });
  }
};

export const isAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({
      success: false,
      message: 'Access denied: Admin privileges required'
    });
    return;
  }
  next();
};
