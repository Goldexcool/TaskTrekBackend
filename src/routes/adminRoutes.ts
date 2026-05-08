import { Router, Request, Response, NextFunction } from 'express';
import testMongoDBDNS from '../utils/dnsTest';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

const checkAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({
      success: false,
      message: 'Access denied: Admin privileges required'
    });
    return;
  }
  next();
};

router.get('/test-mongodb-dns', checkAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const results = await testMongoDBDNS();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Error testing MongoDB DNS'
    });
  }
});

export default router;
