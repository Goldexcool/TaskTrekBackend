require('./config/default'); // runs env validation before anything else

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const { ALLOWED_ORIGINS, NODE_ENV, API_BASE_URL } = require('./config/default');

const authRoutes         = require('./routes/authRoutes');
const userRoutes         = require('./routes/userRoutes');
const boardRoutes        = require('./routes/boardRoutes');
const columnRoutes       = require('./routes/columnRoutes');
const taskRoutes         = require('./routes/taskRoutes');
const teamRoutes         = require('./routes/teamRoutes');
const tenantRoutes       = require('./routes/tenantRoutes');
const activityRoutes     = require('./routes/activityRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { errorHandler }   = require('./middleware/errorMiddleware');

const app = express();

// ── Security headers ───────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ───────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true); // allow non-browser / same-origin
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
    'Content-Type', 'Authorization', 'X-Requested-With',
    'x-tenant-id', 'x-tenant-slug'
  ],
  credentials: true,
  maxAge: 86400
};
app.use(cors(corsOptions));

// ── Body parsing (with size limit) ─────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// ── Rate limiting ──────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
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

// ── Swagger ────────────────────────────────────────────────────────────────────
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
  apis: ['./src/routes/*.js', './src/controllers/*.js', './src/models/*.js']
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',          authLimiter,    authRoutes);
app.use('/api/users',         generalLimiter, userRoutes);
app.use('/api/teams',         generalLimiter, teamRoutes);
app.use('/api/tenants',       generalLimiter, tenantRoutes);
app.use('/api/boards',        generalLimiter, boardRoutes);
app.use('/api/columns',       generalLimiter, columnRoutes);
app.use('/api/tasks',         generalLimiter, taskRoutes);
app.use('/api/activities',    generalLimiter, activityRoutes);
app.use('/api/notifications', generalLimiter, notificationRoutes);

// ── Global error handler ───────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
