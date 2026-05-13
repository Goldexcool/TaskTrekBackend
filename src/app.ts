import './config/default'; // runs env validation before anything else

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

import { ALLOWED_ORIGINS, NODE_ENV, API_BASE_URL } from './config/default';

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import boardRoutes from './routes/boardRoutes';
import columnRoutes from './routes/columnRoutes';
import taskRoutes from './routes/taskRoutes';
import teamRoutes from './routes/teamRoutes';
import tenantRoutes from './routes/tenantRoutes';
import activityRoutes from './routes/activityRoutes';
import notificationRoutes from './routes/notificationRoutes';
import adminRoutes from './routes/adminRoutes';
import { errorHandler } from './middleware/errorMiddleware';

const app = express();

// ── Security headers ────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ────────────────────────────────────────────────────────────────────
const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (
      ALLOWED_ORIGINS.includes(origin) ||
      /\.tasktrek\.com$/.test(origin) ||
      NODE_ENV === 'development'
    ) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'x-tenant-id',
    'x-tenant-slug'
  ],
  credentials: true,
  maxAge: 86400
};
app.use(cors(corsOptions));

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// ── Rate limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

// ── Swagger ──────────────────────────────────────────────────────────────────
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TaskTrek API',
      version: '2.0.0',
      description: 'TaskTrek — multi-tenant Kanban backend'
    },
    servers: [
      { url: 'https://tasktrekbackend-glnc.onrender.com', description: 'Production' },
      { url: API_BASE_URL || 'http://localhost:3000', description: 'Local' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts', './src/models/*.ts']
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', generalLimiter, userRoutes);
app.use('/api/teams', generalLimiter, teamRoutes);
app.use('/api/tenants', generalLimiter, tenantRoutes);
app.use('/api/boards', generalLimiter, boardRoutes);
app.use('/api/columns', generalLimiter, columnRoutes);
app.use('/api/tasks', generalLimiter, taskRoutes);
app.use('/api/activities', generalLimiter, activityRoutes);
app.use('/api/notifications', generalLimiter, notificationRoutes);
app.use('/api/admin', generalLimiter, adminRoutes);

// ── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

export default app;

// CJS interop — allows require() in Jest test files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof module !== 'undefined') { (module as any).exports = app; (module as any).exports.default = app; }
