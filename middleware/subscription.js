import Subscription from '../models/Subscription.js';

// Middleware to check if user has an active subscription
// Like checking if someone has a valid membership card
export const requireSubscription = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Find active subscription
    const subscription = await Subscription.findOne({
      user: userId,
      status: 'active'
    });

    if (!subscription) {
      return res.status(403).json({
        success: false,
        message: 'Active subscription required',
        requiresPlan: true
      });
    }

    // Attach subscription to request
    req.subscription = subscription;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking subscription'
    });
  }
};

// Middleware to check for specific plan level
// Like checking if someone has Premium vs Basic access
export const requirePlan = (minPlan) => {
  return async (req, res, next) => {
    try {
      const userId = req.user._id;

      const subscription = await Subscription.findOne({
        user: userId,
        status: 'active'
      });

      if (!subscription) {
        return res.status(403).json({
          success: false,
          message: 'Active subscription required',
          requiresPlan: true
        });
      }

      // Plan hierarchy: basic < standard < premium
      const planLevels = { basic: 1, standard: 2, premium: 3 };
      const userPlanLevel = planLevels[subscription.plan] || 0;
      const requiredPlanLevel = planLevels[minPlan] || 0;

      if (userPlanLevel < requiredPlanLevel) {
        return res.status(403).json({
          success: false,
          message: `${minPlan} plan required`,
          requiresPlan: true,
          currentPlan: subscription.plan
        });
      }

      req.subscription = subscription;
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error checking plan level'
      });
    }
  };
};

