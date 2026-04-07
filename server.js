import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
// Render uses PORT environment variable, default to 5000 for local development
const PORT = process.env.PORT || 5000;

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, '') : '*',
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// Make io available globally for use in routes
app.set('io', io);

// Middleware
// CORS configuration - allow multiple origins for production
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'https://spiritualunitymatch.com'
].filter(Boolean).map(origin => origin.replace(/\/$/, ''));

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or curl)
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/$/, '');
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(normalizedOrigin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      // In production, be more strict - allow known origins only
      // But also allow Render preview URLs
      if (normalizedOrigin.includes('.onrender.com')) {
        callback(null, true);
      } else {
        console.warn(`⚠️ [CORS] Origin rejected: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Stripe webhook needs raw body for signature verification
// Register webhook route BEFORE express.json() middleware
app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// MongoDB Connection
// Using the provided connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://arghyanextbusinesssolution_db_user:HIoHvpDclQ9ei0NO@cluster0.ulsxizj.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });

// Routes
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import subscriptionRoutes from './routes/subscriptions.js';
import matchRoutes from './routes/matches.js';
import messageRoutes from './routes/messages.js';
import adminRoutes from './routes/admin.js';
import spiritualRoutes from './routes/spiritual.js';
import communityRoutes from './routes/community.js';
import soulRoutes from './routes/soul.js';
import eventsRoutes from './routes/events.js';

app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/spiritual', spiritualRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/soul', soulRoutes);
app.use('/api/events', eventsRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Spiritual Unity Match API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      profiles: '/api/profiles',
      matches: '/api/matches',
      messages: '/api/messages',
      subscriptions: '/api/subscriptions',
      soul: '/api/soul'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Spiritual Unity Match API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Initialize Socket.IO service
import { initializeSocket } from './services/socketService.js';
initializeSocket(io);

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Spiritual Unity Match API running on port ${PORT}`);
  console.log(`🔌 Socket.IO ready for real-time messaging`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

