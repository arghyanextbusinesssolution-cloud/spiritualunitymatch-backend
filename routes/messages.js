import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireSubscription } from '../middleware/subscription.js';
import Message from '../models/Message.js';
import Match from '../models/Match.js';
import Profile from '../models/Profile.js';
import Engagement from '../models/Engagement.js';
import Notification from '../models/Notification.js';
import Subscription from '../models/Subscription.js';
import { emitNewMessage } from '../services/socketService.js';

const router = express.Router();

// @route   POST /api/messages
// @desc    Send a message
// @access  Private (requires standard or premium)
router.post('/', protect, requireSubscription, async (req, res) => {
  try {
    const userId = req.user._id;
    const { recipientId, content, messageType = 'text', voiceNoteUrl, guidedTemplateId } = req.body;

    if (!recipientId || !content) {
      return res.status(400).json({
        success: false,
        message: 'Recipient and content are required'
      });
    }

    // Check subscription for messaging
    const subscription = req.subscription;
    if (!subscription.features.messaging) {
      return res.status(403).json({
        success: false,
        message: 'Standard or Premium plan required to send messages',
        requiresUpgrade: true
      });
    }

    // Check if they have a match (mutual like required for messaging)
    const match = await Match.findOne({
      $or: [
        { user1: userId, user2: recipientId },
        { user1: recipientId, user2: userId }
      ],
      isMatch: true
    });

    if (!match) {
      return res.status(403).json({
        success: false,
        message: 'You must match with this user before messaging'
      });
    }

    // Check daily message limit for basic/standard plans
    if (subscription.plan !== 'premium') {
      let engagement = await Engagement.findOne({ user: userId });
      if (!engagement) {
        engagement = new Engagement({ user: userId });
      }

      engagement.resetDailyLimits();

      if (engagement.dailyMessagesLimit > 0 && 
          engagement.dailyMessagesUsed >= engagement.dailyMessagesLimit) {
        return res.status(403).json({
          success: false,
          message: 'Daily message limit reached. Upgrade to Premium for unlimited messaging.',
          requiresUpgrade: true
        });
      }

      engagement.dailyMessagesUsed += 1;
      engagement.messagesSent += 1;
      engagement.lastMessage = new Date();
      await engagement.save();
    }

    // Create message
    const message = await Message.create({
      sender: userId,
      recipient: recipientId,
      match: match._id,
      content,
      messageType,
      voiceNoteUrl,
      guidedTemplateId
    });

    // Populate sender and recipient for socket emission
    await message.populate('sender', 'email');
    await message.populate('recipient', 'email');

    // Update match last interaction
    match.lastInteraction = new Date();
    await match.save();

    // Create notification for recipient
    await Notification.create({
      user: recipientId,
      type: 'new_message',
      title: 'New Message',
      message: 'You have a new message',
      relatedUser: userId,
      relatedMessage: message._id,
      actionUrl: `/messages/${userId}`
    });

    // Emit socket event for real-time messaging
    const io = req.app.get('io');
    if (io) {
      // Ensure recipientId is a string for socket emission
      const recipientIdStr = recipientId?.toString() || recipientId;
      emitNewMessage(io, message, recipientIdStr);
    }

    res.status(201).json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message'
    });
  }
});

// @route   GET /api/messages/conversations
// @desc    Get all conversations (only with mutual matches)
// @access  Private (requires standard or premium)
router.get('/conversations', protect, requireSubscription, async (req, res) => {
  try {
    const userId = req.user._id;

    const subscription = req.subscription;
    if (!subscription.features.messaging) {
      return res.status(403).json({
        success: false,
        message: 'Standard or Premium plan required',
        requiresUpgrade: true
      });
    }

    // Get all unique conversations (only where there's a mutual match)
    // First, get all mutual matches for this user
    const mutualMatches = await Match.find({
      $or: [{ user1: userId }, { user2: userId }],
      isMatch: true
    });

    // Extract other user IDs from mutual matches
    const matchedUserIds = mutualMatches.map(match => {
      return match.user1.toString() === userId.toString() 
        ? match.user2.toString()
        : match.user1.toString();
    });

    if (matchedUserIds.length === 0) {
      return res.json({
        success: true,
        conversations: []
      });
    }

    // Create conversations map - initialize with all mutual matches
    const conversationsMap = new Map();
    
    // Initialize all mutual matches (even without messages) with match info
    const matchInfoMap = new Map(); // Store match info for quick lookup
    
    for (const match of mutualMatches) {
      const otherUserId = match.user1.toString() === userId.toString() 
        ? match.user2.toString()
        : match.user1.toString();
      
      // Store match info for later use
      matchInfoMap.set(otherUserId, {
        matchedAt: match.matchedAt || match.createdAt
      });
      
      conversationsMap.set(otherUserId, {
        userId: otherUserId,
        lastMessage: null,
        unreadCount: 0,
        matchedAt: match.matchedAt || match.createdAt
      });
    }

    // Get messages only with matched users
    const messages = await Message.find({
      $or: [
        { sender: userId, recipient: { $in: matchedUserIds } },
        { sender: { $in: matchedUserIds }, recipient: userId }
      ],
      isDeleted: false
    })
      .populate('sender', 'email')
      .populate('recipient', 'email')
      .sort({ createdAt: -1 });

    // Update conversations with message data
    messages.forEach(msg => {
      const otherUserId = msg.sender._id.toString() === userId.toString() 
        ? msg.recipient._id.toString()
        : msg.sender._id.toString();

      if (!conversationsMap.has(otherUserId)) {
        conversationsMap.set(otherUserId, {
          userId: otherUserId,
          lastMessage: msg,
          unreadCount: 0
        });
      }

      const conv = conversationsMap.get(otherUserId);
      
      // Update last message if this is newer
      if (!conv.lastMessage || msg.createdAt > conv.lastMessage.createdAt) {
        conv.lastMessage = msg;
      }
      
      // Count unread messages
      if (!msg.isRead && msg.recipient._id.toString() === userId.toString()) {
        conv.unreadCount += 1;
      }
    });

    // Get profiles for each conversation (match info already in map)
    const conversations = await Promise.all(
      Array.from(conversationsMap.values()).map(async (conv) => {
        const profile = await Profile.findOne({ 
          user: conv.userId 
        });
        
        return {
          userId: conv.userId,
          profile,
          lastMessage: conv.lastMessage,
          unreadCount: conv.unreadCount || 0,
          matchedAt: conv.matchedAt
        };
      })
    );

    // Sort by last message time (if exists), otherwise by matchedAt
    conversations.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt) : new Date(a.matchedAt || 0);
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt) : new Date(b.matchedAt || 0);
      return bTime.getTime() - aTime.getTime();
    });

    res.json({
      success: true,
      conversations
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching conversations'
    });
  }
});

// @route   GET /api/messages/conversation/:userId
// @desc    Get conversation with specific user
// @access  Private (requires standard or premium)
router.get('/conversation/:userId', protect, requireSubscription, async (req, res) => {
  try {
    const userId = req.user._id;
    const otherUserId = req.params.userId;

    const subscription = req.subscription;
    if (!subscription.features.messaging) {
      return res.status(403).json({
        success: false,
        message: 'Standard or Premium plan required',
        requiresUpgrade: true
      });
    }

    // Check if they have a mutual match (REQUIRED for messaging)
    const match = await Match.findOne({
      $or: [
        { user1: userId, user2: otherUserId },
        { user1: otherUserId, user2: userId }
      ],
      isMatch: true
    });

    if (!match) {
      return res.status(403).json({
        success: false,
        message: 'You must match with this user before messaging. Both users need to like each other.',
        requiresMatch: true
      });
    }

    // Get all messages in conversation
    const messages = await Message.find({
      $or: [
        { sender: userId, recipient: otherUserId },
        { sender: otherUserId, recipient: userId }
      ],
      isDeleted: false
    })
      .populate('sender', 'email')
      .populate('recipient', 'email')
      .sort({ createdAt: 1 });

    // Mark messages as read
    const readMessages = await Message.updateMany(
      {
        sender: otherUserId,
        recipient: userId,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );

    // Emit socket event for read status if messages were marked as read
    if (readMessages.modifiedCount > 0) {
      const io = req.app.get('io');
      if (io) {
        const readAt = new Date();
        io.to(`user:${otherUserId}`).emit('messages_read', {
          userId,
          readAt
        });
      }
    }

    res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching conversation'
    });
  }
});

export default router;

