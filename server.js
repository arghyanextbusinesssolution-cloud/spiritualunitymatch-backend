import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Import Routes
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

// Import Services
import { initializeSocket } from './services/socketService.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
// Render/Hostinger uses PORT environment variable, default to 5000 for local development
const PORT = process.env.PORT || 5000;

// CORS origins defined from environment variables
const envOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
const frontendUrl = process.env.FRONTEND_URL;
const allowedOrigins = [
  ...envOrigins,
  frontendUrl,
  'https://spiritualunitymatch.com', // Keep placeholders if they are standard
  'https://www.spiritualunitymatch.com',
  'http://localhost:3000'
].filter(Boolean).filter((item, index, self) => self.indexOf(item) === index);

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// Make io available globally for use in routes
app.set('io', io);


// Middleware
// CORS configuration - allow multiple origins for production
console.log('🌐 [CORS] Allowed Origins:', allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    console.log('🌍 Incoming Origin:', origin);

    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    console.warn(`❌ Rejected Origin: ${origin}`);
    return callback(null, false); // ⚠️ IMPORTANT: don't throw error
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Explicitly handle preflight requests
app.options('*', cors());

// Stripe webhook needs raw body for signature verification
// Register webhook route BEFORE express.json() middleware
app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// MongoDB Connection with improved error handling
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://arghyanextbusinesssolution_db_user:HIoHvpDclQ9ei0NO@cluster0.ulsxizj.mongodb.net/dating-website?appName=Cluster0';

console.log('🔌 [DB] Attempting connection to MongoDB...');
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ [DB] MongoDB connected successfully');
  })
  .catch((error) => {
    console.error('❌ [DB] MongoDB connection error:', error.message);
    console.warn('⚠️ [DB] Server running without database functionality');
  });

// Routes
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

// Root route for connection testing
app.get('/', (req, res) => {
  res.send('<h1>✅ Spiritual Unity Match Backend is Running!</h1><p>Visit <a href="/api/health">/api/health</a> for full status.</p>');
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Spiritual Unity Match API is running',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
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
initializeSocket(io);

// Start server with explicit interface binding for cloud hosting
const server = httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [Server] Spiritual Unity Match API running on port ${PORT}`);
  console.log(`🔌 [Server] Interface binding: 0.0.0.0`);
  console.log(`🌐 [Server] Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`✅ [Server] API ready for requests`);
});

// Handle server errors (e.g., EADDRINUSE)
server.on('error', (err) => {
  console.error('❌ [Server] Startup error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ [Server] Port ${PORT} is already in use.`);
  }
  process.exit(1);
});
