import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import app from './app';

dotenv.config();

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
  }
});

app.set('io', io);

io.on('connection', socket => {
  console.log('New client connected:', socket.id);

  socket.on('join:user', (userId: string) => {
    if (userId) {
      socket.join(`user:${userId}`);
      console.log(`User ${userId} joined their room`);
    }
  });

  socket.on('join:board', (boardId: string) => {
    if (boardId) {
      socket.join(`board:${boardId}`);
      console.log(`User joined board room: ${boardId}`);
    }
  });

  socket.on('join:team', (teamId: string) => {
    if (teamId) {
      socket.join(`team:${teamId}`);
      console.log(`User joined team room: ${teamId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const connectDB = async (): Promise<void> => {
  const maxRetries = 4;
  let retries = 0;
  let connected = false;

  while (retries < maxRetries && !connected) {
    try {
      retries++;
      console.log(`MongoDB connection attempt ${retries}/${maxRetries}...`);

      const uri = process.env.MONGODB_URI || '';
      const usernameMatch = uri.match(/\/\/(.*?):/);
      const username = usernameMatch ? usernameMatch[1] : 'unknown';
      console.log(`Connecting with username: ${username}`);

      await mongoose.connect(uri);
      connected = true;

      console.log(`MongoDB connected successfully: ${mongoose.connection.host}`);
      console.log(`Database name: ${mongoose.connection.db.databaseName}`);
    } catch (error) {
      console.error(`Connection attempt ${retries} failed:`, (error as Error).message);

      if (retries >= maxRetries) {
        throw error;
      }

      await new Promise<void>(resolve => setTimeout(resolve, 2000));
    }
  }
};

const startServer = async (): Promise<void> => {
  try {
    await connectDB();

    const requiredEnvVars = [
      'MONGODB_URI',
      'JWT_SECRET',
      'ACCESS_TOKEN_SECRET',
      'REFRESH_TOKEN_SECRET'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      console.error('Missing required environment variables:', missingVars.join(', '));
      process.exit(1);
    }

    console.log('All required environment variables are set');

    const PORT = process.env.PORT || 3000;

    server.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    });
  } catch (error) {
    console.error('Server startup error:', error);
    process.exit(1);
  }
};

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error: unknown) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});

startServer();
