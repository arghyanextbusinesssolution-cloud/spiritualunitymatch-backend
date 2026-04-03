import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Message from '../models/Message.js';

/**
 * Socket Service
 * Handles real-time messaging via WebSockets
 */

// Store active socket connections by userId
const activeUsers = new Map(); // userId -> socketId

/**
 * Authenticate socket connection using JWT token
 */
export const authenticateSocket = async (socket, next) => {
  try {
    // Get token from handshake auth or query
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    if (user.isSuspended) {
      return next(new Error('Authentication error: Account is suspended'));
    }

    // Attach user to socket
    socket.userId = user._id.toString();
    socket.user = user;
    
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication error: Invalid token'));
  }
};

/**
 * Initialize socket handlers
 */
export const initializeSocket = (io) => {
  // Authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const userId = socket.userId;
    console.log(`✅ User connected: ${userId} (socket: ${socket.id})`);

    // Store active connection
    activeUsers.set(userId, socket.id);

    // Emit online status to user
    socket.emit('connected', {
      message: 'Connected to real-time messaging',
      userId: userId
    });

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Handle joining a conversation room
    socket.on('join_conversation', ({ otherUserId }) => {
      if (!otherUserId) {
        socket.emit('error', { message: 'Other user ID is required' });
        return;
      }

      // Create a unique room for the conversation
      // Room ID is sorted user IDs to ensure consistency
      const roomId = [userId, otherUserId].sort().join(':');
      socket.join(`conversation:${roomId}`);
      
      console.log(`User ${userId} joined conversation room: ${roomId}`);
      socket.emit('joined_conversation', { roomId, otherUserId });
    });

    // Handle leaving a conversation room
    socket.on('leave_conversation', ({ otherUserId }) => {
      if (!otherUserId) return;

      const roomId = [userId, otherUserId].sort().join(':');
      socket.leave(`conversation:${roomId}`);
      
      console.log(`User ${userId} left conversation room: ${roomId}`);
    });

    // Handle typing indicator
    socket.on('typing_start', ({ recipientId }) => {
      if (!recipientId) return;

      const roomId = [userId, recipientId].sort().join(':');
      socket.to(`conversation:${roomId}`).emit('user_typing', {
        userId,
        isTyping: true
      });
    });

    socket.on('typing_stop', ({ recipientId }) => {
      if (!recipientId) return;

      const roomId = [userId, recipientId].sort().join(':');
      socket.to(`conversation:${roomId}`).emit('user_typing', {
        userId,
        isTyping: false
      });
    });

    // Handle message read status
    socket.on('message_read', async ({ messageId, senderId }) => {
      try {
        // Update message as read in database
        await Message.findByIdAndUpdate(messageId, {
          isRead: true,
          readAt: new Date()
        });

        // Notify sender that message was read
        if (senderId) {
          io.to(`user:${senderId}`).emit('message_read_status', {
            messageId,
            readAt: new Date()
          });
        }
      } catch (error) {
        console.error('Error updating message read status:', error);
        socket.emit('error', { message: 'Failed to update read status' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${userId} (socket: ${socket.id})`);
      activeUsers.delete(userId);

      // Notify users in conversations that user went offline
      socket.broadcast.emit('user_offline', { userId });
    });
  });
};

/**
 * Emit new message to conversation participants
 */
export const emitNewMessage = (io, message, recipientId) => {
  try {
    // Extract sender ID (handle both ObjectId and populated objects)
    const senderId = message.sender?._id?.toString() || message.sender?.toString() || message.sender;
    const recipientIdStr = recipientId?.toString() || recipientId;
    
    if (!senderId || !recipientIdStr) {
      console.error('Error emitting message: Missing sender or recipient ID');
      return;
    }

    // Create room ID (sorted user IDs)
    const roomId = [senderId, recipientIdStr].sort().join(':');
    
    // Prepare message data (handle populated objects)
    const messageData = {
      _id: message._id?.toString() || message._id,
      sender: senderId,
      recipient: recipientIdStr,
      content: message.content,
      messageType: message.messageType || 'text',
      voiceNoteUrl: message.voiceNoteUrl,
      createdAt: message.createdAt || new Date(),
      isRead: message.isRead || false
    };
    
    // Emit to conversation room (both users get this)
    // Note: The sender will also receive this, but they should handle it by replacing their optimistic message
    io.to(`conversation:${roomId}`).emit('new_message', {
      message: messageData
    });

    // Also emit notification to recipient's personal room (only for their notification system)
    // This is a different event, so recipient won't get duplicate messages
    io.to(`user:${recipientIdStr}`).emit('new_message_notification', {
      message: messageData,
      conversationUpdate: true
    });
    
    console.log(`📨 [Socket] Emitted message to conversation:${roomId} (sender: ${senderId}, recipient: ${recipientIdStr})`);

    console.log(`📨 Message emitted to room: conversation:${roomId}`);
  } catch (error) {
    console.error('Error emitting new message:', error);
  }
};

/**
 * Check if user is online
 */
export const isUserOnline = (userId) => {
  return activeUsers.has(userId);
};

/**
 * Get socket ID for user
 */
export const getUserSocketId = (userId) => {
  return activeUsers.get(userId);
};
