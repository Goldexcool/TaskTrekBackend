const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

dotenv.config();

if (!process.env.ACCESS_TOKEN_SECRET) {
  console.warn('⚠️ JWT_SECRET not found in environment, using development fallback (NOT SECURE FOR PRODUCTION)');
  process.env.ACCESS_TOKEN_SECRET = 'dev-jwt-secret-key-tasktrek-backend-2025-development-only';
}

if (!process.env.REFRESH_TOKEN_SECRET) {
  console.warn('⚠️ REFRESH_TOKEN_SECRET not found in environment, using development fallback (NOT SECURE FOR PRODUCTION)');
  process.env.REFRESH_TOKEN_SECRET = 'dev-refresh-token-secret-key-tasktrek-backend-2025-development-only';
}

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:3000'];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || 
        /\.tasktrek\.com$/.test(origin) || 
        process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.log(`Origin ${origin} not allowed by CORS`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400
};

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes'); 
const boardRoutes = require('./routes/boardRoutes');
const columnRoutes = require('./routes/columnRoutes');
const taskRoutes = require('./routes/taskRoutes');
const teamRoutes = require('./routes/teamRoutes');
const activityRoutes = require('./routes/activityRoutes'); 
const notificationRoutes = require('./routes/notificationRoutes');
const { errorHandler } = require('./middleware/errorMiddleware');

const app = express();

// Swagger/OpenAPI setup
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'TaskTrek API',
    version: '1.0.0',
    description: 'TaskTrek Backend API documentation (Kanban-style task and team management)',
  },
  servers: [
    {
      url: 'https://tasktrekbackend-glnc.onrender.com',
      description: 'Production server',
    },
    {
      url: process.env.API_BASE_URL || 'http://localhost:3000',
      description: 'Local development server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
};

const swaggerOptions = {
  definition: swaggerDefinition,
  apis: [
    './src/routes/*.js',
    './src/controllers/*.js',
    './src/models/*.js',
  ],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors(corsOptions));
app.use(cookieParser());

// Swagger UI route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/auth', authRoutes);  
app.use('/api/users', userRoutes); 
app.use('/api/teams', teamRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/columns', columnRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(errorHandler);

module.exports = app;