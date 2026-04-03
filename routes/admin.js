import express from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import Subscription from '../models/Subscription.js';
import Match from '../models/Match.js';
import Message from '../models/Message.js';
import AdminAction from '../models/Admin.js';
import Payment from '../models/Payment.js';

const router = express.Router();

// All admin routes require admin authentication
router.use(protect);
router.use(adminOnly);

// @route   GET /api/admin/stats
// @desc    Get platform statistics
// @access  Private (admin)
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalProfiles = await Profile.countDocuments();
    const approvedProfiles = await Profile.countDocuments({ isApproved: true });
    const pendingProfiles = await Profile.countDocuments({ approvalStatus: 'pending' });

    const totalSubscriptions = await Subscription.countDocuments({ status: 'active' });
    const basicSubs = await Subscription.countDocuments({ plan: 'basic', status: 'active' });
    const standardSubs = await Subscription.countDocuments({ plan: 'standard', status: 'active' });
    const premiumSubs = await Subscription.countDocuments({ plan: 'premium', status: 'active' });

    const totalMatches = await Match.countDocuments({ isMatch: true });
    const totalMessages = await Message.countDocuments();

    // Calculate total earnings based on active subscriptions
    const PLAN_PRICES = {
      basic: { monthly: 4.99, yearly: 49.99 },
      standard: { monthly: 9.99, yearly: 99.99 },
      premium: { monthly: 19.99, yearly: 199.99 }
    };

    const activeSubscriptions = await Subscription.find({ status: 'active' });
    const totalEarnings = activeSubscriptions.reduce((sum, sub) => {
      const price = PLAN_PRICES[sub.plan]?.[sub.billingCycle || 'monthly'] || 0;
      return sum + price;
    }, 0);

    // Calculate revenue trend (last 6 months) based on subscription creation
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const subscriptionsInLast6Months = await Subscription.find({
      status: 'active',
      createdAt: { $gte: sixMonthsAgo }
    });

    const monthlyRevenueMap = {};
    subscriptionsInLast6Months.forEach(sub => {
      const month = sub.createdAt.getMonth() + 1;
      const year = sub.createdAt.getFullYear();
      const key = `${year}-${month}`;
      const price = PLAN_PRICES[sub.plan]?.[sub.billingCycle || 'monthly'] || 0;
      monthlyRevenueMap[key] = (monthlyRevenueMap[key] || 0) + price;
    });

    // Format revenue data
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueData = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const monthIndex = d.getMonth();
      const year = d.getFullYear();

      const key = `${year}-${monthIndex + 1}`;
      revenueData.push({
        month: monthNames[monthIndex],
        revenue: monthlyRevenueMap[key] || 0
      });
    }

    // Calculate user growth (last 6 months)
    const monthlyUsers = await User.aggregate([
      {
        $match: {
          role: 'user',
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          users: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Format user growth data
    const userGrowthData = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const monthIndex = d.getMonth();
      const year = d.getFullYear();

      const found = monthlyUsers.find(u => u._id.month === monthIndex + 1 && u._id.year === year);
      userGrowthData.push({
        month: monthNames[monthIndex],
        users: found ? found.users : 0
      });
    }

    // Get email list
    const users = await User.find({ role: 'user' }).select('email');
    const emailList = users.map(u => u.email);

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          withProfiles: totalProfiles,
          approved: approvedProfiles,
          pending: pendingProfiles
        },
        subscriptions: {
          total: totalSubscriptions,
          basic: basicSubs,
          standard: standardSubs,
          premium: premiumSubs
        },
        engagement: {
          matches: totalMatches,
          messages: totalMessages
        },
        earnings: {
          total: totalEarnings,
          revenueData,
          userGrowthData
        },
        subscriptionDistribution: [
          { name: 'Free', value: totalUsers - totalSubscriptions },
          { name: 'Premium', value: totalSubscriptions }
        ],
        quickStats: {
          newUsersThisMonth: userGrowthData.length > 0 ? userGrowthData[userGrowthData.length - 1].users : 0,
          activeMatches: totalMatches,
          pendingApprovals: pendingProfiles,
          mrr: totalEarnings // Since these are already standardized or actual earnings depending on plan, we can use totalEarnings or recalculate MRR based on monthly cost. For now using totalEarnings.
        },
        emailList
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics'
    });
  }
});

// @route   GET /api/admin/subscriptions
// @desc    Get all subscriptions with user details (non-admin users only)
// @access  Private (admin)
router.get('/subscriptions', async (req, res) => {
  try {
    const PLAN_PRICES = {
      basic: { monthly: 4.99, yearly: 49.99 },
      standard: { monthly: 9.99, yearly: 99.99 },
      premium: { monthly: 19.99, yearly: 199.99 }
    };

    const subscriptions = await Subscription.find()
      .populate('user', 'email role')
      .sort({ createdAt: -1 });

    // Filter out admin accounts
    const filtered = subscriptions.filter(sub => sub.user && sub.user.role !== 'admin');

    const computeEndDate = (sub) => {
      if (sub.endDate) return sub.endDate;
      if (!sub.startDate) return null;
      const start = new Date(sub.startDate);
      if (sub.billingCycle === 'yearly') {
        return new Date(start.setFullYear(start.getFullYear() + 1));
      }
      // Default: monthly = +30 days
      return new Date(start.setDate(start.getDate() + 30));
    };

    const data = filtered.map(sub => ({
      _id: sub._id,
      email: sub.user?.email || 'Unknown',
      plan: sub.plan,
      status: sub.status,
      billingCycle: sub.billingCycle,
      startDate: sub.startDate,
      endDate: computeEndDate(sub),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      amount: PLAN_PRICES[sub.plan]?.[sub.billingCycle || 'monthly'] || 0
    }));

    const activeCount = data.filter(s => s.status === 'active').length;
    const canceledCount = data.filter(s => s.status === 'canceled').length;
    const monthlyRevenue = data
      .filter(s => s.status === 'active')
      .reduce((sum, s) => {
        const monthlyAmount = s.billingCycle === 'yearly' ? s.amount / 12 : s.amount;
        return sum + monthlyAmount;
      }, 0);

    const churnRate = data.length > 0 ? ((canceledCount / data.length) * 100).toFixed(1) : '0.0';

    res.json({
      success: true,
      subscriptions: data,
      stats: {
        activeCount,
        canceledCount,
        monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
        churnRate
      }
    });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ success: false, message: 'Error fetching subscriptions' });
  }
});

// @route   GET /api/admin/matches
// @desc    Get match statistics and match pair list
// @access  Private (admin)
router.get('/matches', async (req, res) => {
  try {
    const allMatches = await Match.find()
      .populate('user1', 'email')
      .populate('user2', 'email')
      .sort({ createdAt: -1 });

    const totalInteractions = allMatches.length;
    const totalMatches = allMatches.filter(m => m.isMatch).length;
    const totalLikes = allMatches.filter(m => m.user1Liked || m.user2Liked).length;
    const matchRate = totalLikes > 0 ? ((totalMatches / totalLikes) * 100).toFixed(1) : '0.0';

    const pairs = allMatches.map(m => ({
      _id: m._id,
      user1Email: m.user1?.email || 'Unknown',
      user2Email: m.user2?.email || 'Unknown',
      user1Liked: m.user1Liked,
      user2Liked: m.user2Liked,
      isMatch: m.isMatch,
      matchScore: m.matchScore,
      matchLabels: m.matchLabels,
      matchedAt: m.matchedAt,
      createdAt: m.createdAt
    }));

    res.json({
      success: true,
      stats: {
        totalInteractions,
        totalMatches,
        totalLikes,
        matchRate
      },
      matches: pairs
    });
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({ success: false, message: 'Error fetching matches' });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users
// @access  Private (admin)
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;

    const query = { role: 'user' };
    if (search) {
      query.email = { $regex: search, $options: 'i' };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    // Get profiles and subscriptions for each user
    const usersWithDetails = await Promise.all(
      users.map(async (user) => {
        const profile = await Profile.findOne({ user: user._id });
        const subscription = await Subscription.findOne({ user: user._id });

        return {
          ...user.toObject(),
          hasProfile: !!profile,
          profileApproved: profile?.isApproved || false,
          subscription: subscription ? {
            plan: subscription.plan,
            status: subscription.status
          } : null
        };
      })
    );

    res.json({
      success: true,
      users: usersWithDetails,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users'
    });
  }
});

// @route   DELETE /api/admin/users/:userId
// @desc    Delete a user
// @access  Private (admin)
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete related data
    await Profile.deleteOne({ user: userId });
    await Subscription.deleteOne({ user: userId });
    await Match.deleteMany({
      $or: [{ user1: userId }, { user2: userId }]
    });
    await Message.deleteMany({
      $or: [{ sender: userId }, { recipient: userId }]
    });

    // Delete user
    await User.deleteOne({ _id: userId });

    // Log admin action
    await AdminAction.create({
      admin: req.user._id,
      action: 'user_deleted',
      targetUser: userId,
      details: { email: user.email },
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user'
    });
  }
});

// @route   POST /api/admin/users/:userId/suspend
// @desc    Suspend or unsuspend a user
// @access  Private (admin)
router.post('/users/:userId/suspend', async (req, res) => {
  try {
    const { userId } = req.params;
    const { suspend, reason } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isSuspended = suspend || false;
    user.suspensionReason = suspend ? (reason || 'Violation of terms') : null;
    await user.save();

    // Log admin action
    await AdminAction.create({
      admin: req.user._id,
      action: suspend ? 'user_suspended' : 'user_unsuspended',
      targetUser: userId,
      details: { reason: user.suspensionReason },
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `User ${suspend ? 'suspended' : 'unsuspended'} successfully`,
      user
    });
  } catch (error) {
    console.error('Suspend user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error suspending user'
    });
  }
});

// @route   POST /api/admin/profiles/:profileId/approve
// @desc    Approve or reject a profile
// @access  Private (admin)
router.post('/profiles/:profileId/approve', async (req, res) => {
  try {
    const { profileId } = req.params;
    const { approved, reason } = req.body;

    const profile = await Profile.findById(profileId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    if (approved) {
      profile.isApproved = true;
      profile.approvalStatus = 'approved';
      profile.rejectionReason = null;
    } else {
      profile.isApproved = false;
      profile.approvalStatus = 'rejected';
      profile.rejectionReason = reason || 'Profile did not meet guidelines';
    }

    await profile.save();

    // Log admin action
    await AdminAction.create({
      admin: req.user._id,
      action: approved ? 'profile_approved' : 'profile_rejected',
      targetUser: profile.user,
      details: { reason: profile.rejectionReason },
      ipAddress: req.ip
    });

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Approve profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving profile'
    });
  }
});

export default router;

