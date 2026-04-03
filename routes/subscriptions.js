import express from 'express';
// import Stripe from 'stripe'; // COMMENTED OUT FOR TESTING - No payment needed
import { protect } from '../middleware/auth.js';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';

const router = express.Router();

// Initialize Stripe (COMMENTED OUT FOR TESTING)
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Plan configuration
// These price IDs need to be set up in Stripe Dashboard
const PLAN_PRICES = {
  basic: {
    monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY || 'price_basic_monthly',
    yearly: process.env.STRIPE_PRICE_BASIC_YEARLY || 'price_basic_yearly'
  },
  standard: {
    monthly: process.env.STRIPE_PRICE_STANDARD_MONTHLY || 'price_standard_monthly',
    yearly: process.env.STRIPE_PRICE_STANDARD_YEARLY || 'price_standard_yearly'
  },
  premium: {
    monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY || 'price_premium_monthly',
    yearly: process.env.STRIPE_PRICE_PREMIUM_YEARLY || 'price_premium_yearly'
  }
};

// @route   POST /api/subscriptions/create-checkout
// @desc    Create Stripe checkout session (TEST MODE: Direct activation without payment)
// @access  Private
router.post('/create-checkout', protect, async (req, res) => {
  try {
    const { plan, billingCycle } = req.body;

    if (!plan || !['basic', 'standard', 'premium'].includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected'
      });
    }

    if (!billingCycle || !['monthly', 'yearly'].includes(billingCycle)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid billing cycle'
      });
    }

    // ============================================
    // TEST MODE: Direct activation without payment
    // ============================================
    // Comment out Stripe code for testing - activate plan immediately

    const userId = req.user._id;

    // Calculate end date based on billing cycle
    const endDate = new Date();
    if (billingCycle === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    // Create or update subscription directly
    let subscription = await Subscription.findOne({ user: userId });

    if (!subscription) {
      subscription = new Subscription({
        user: userId,
        plan,
        status: 'active',
        billingCycle,
        startDate: new Date(),
        endDate: endDate
      });
    } else {
      subscription.plan = plan;
      subscription.status = 'active';
      subscription.billingCycle = billingCycle;
      subscription.startDate = new Date();
      subscription.endDate = endDate;
      subscription.canceledAt = null;
      subscription.cancelAtPeriodEnd = false;
    }

    // Update features based on plan
    subscription.updateFeatures();
    await subscription.save();

    // Create a test payment record (optional - for tracking)
    await Payment.create({
      user: userId,
      subscription: subscription._id,
      amount: 0, // Free for testing
      currency: 'usd',
      plan,
      billingCycle,
      status: 'succeeded',
      metadata: { test_mode: true }
    });

    // Create notification
    await Notification.create({
      user: userId,
      type: 'subscription_activated',
      title: 'Subscription Activated',
      message: `Your ${plan} subscription has been activated! (Test Mode)`,
      actionUrl: '/dashboard'
    });

    console.log(`✅ TEST MODE: Subscription activated for user ${userId}: ${plan} (${billingCycle})`);

    // Return success response (no Stripe redirect needed)
    res.json({
      success: true,
      message: 'Subscription activated successfully (Test Mode)',
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        billingCycle: subscription.billingCycle
      },
      redirectUrl: '/subscription/success'
    });

    // ============================================
    // PRODUCTION CODE (COMMENTED OUT FOR TESTING)
    // ============================================
    /*
    const priceId = PLAN_PRICES[plan][billingCycle];

    // Get or create Stripe customer
    let customerId;
    const existingSubscription = await Subscription.findOne({ user: req.user._id });
    
    if (existingSubscription?.stripeCustomerId) {
      customerId = existingSubscription.stripeCustomerId;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: {
          userId: req.user._id.toString()
        }
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription/cancel`,
      metadata: {
        userId: req.user._id.toString(),
        plan,
        billingCycle
      }
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });
    */
  } catch (error) {
    console.error('Checkout creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating checkout session',
      error: error.message
    });
  }
});

// @route   POST /api/subscriptions/webhook
// @desc    Stripe webhook handler
// @access  Public (Stripe calls this)
// Note: Raw body middleware is applied in server.js before express.json()
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Handle checkout completion
async function handleCheckoutCompleted(session) {
  const userId = session.metadata.userId;
  const plan = session.metadata.plan;
  const billingCycle = session.metadata.billingCycle;

  // Get subscription from Stripe
  const subscription = await stripe.subscriptions.retrieve(session.subscription);

  // Create or update subscription in database
  let userSubscription = await Subscription.findOne({ user: userId });

  if (!userSubscription) {
    userSubscription = new Subscription({
      user: userId,
      plan,
      status: 'active',
      stripeCustomerId: session.customer,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0].price.id,
      billingCycle,
      startDate: new Date(subscription.current_period_start * 1000),
      endDate: new Date(subscription.current_period_end * 1000)
    });
  } else {
    userSubscription.plan = plan;
    userSubscription.status = 'active';
    userSubscription.stripeCustomerId = session.customer;
    userSubscription.stripeSubscriptionId = subscription.id;
    userSubscription.stripePriceId = subscription.items.data[0].price.id;
    userSubscription.billingCycle = billingCycle;
    userSubscription.startDate = new Date(subscription.current_period_start * 1000);
    userSubscription.endDate = new Date(subscription.current_period_end * 1000);
    userSubscription.canceledAt = null;
    userSubscription.cancelAtPeriodEnd = false;
  }

  // Update features based on plan
  userSubscription.updateFeatures();
  await userSubscription.save();

  // Create payment record
  await Payment.create({
    user: userId,
    subscription: userSubscription._id,
    stripeSessionId: session.id,
    stripePaymentIntentId: session.payment_intent,
    amount: session.amount_total / 100, // Convert from cents
    currency: session.currency,
    plan,
    billingCycle,
    status: 'succeeded'
  });

  // Create notification
  await Notification.create({
    user: userId,
    type: 'subscription_activated',
    title: 'Subscription Activated',
    message: `Your ${plan} subscription has been activated!`,
    actionUrl: '/dashboard'
  });

  console.log(`Subscription activated for user ${userId}: ${plan} (${billingCycle})`);
}

// Handle subscription updates
async function handleSubscriptionUpdated(stripeSubscription) {
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: stripeSubscription.id
  });

  if (subscription) {
    subscription.status = stripeSubscription.status === 'active' ? 'active' : 'past_due';
    subscription.startDate = new Date(stripeSubscription.current_period_start * 1000);
    subscription.endDate = new Date(stripeSubscription.current_period_end * 1000);
    subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;

    if (stripeSubscription.cancel_at_period_end) {
      subscription.canceledAt = new Date();
    }

    await subscription.save();
  }
}

// Handle subscription deletion/cancellation
async function handleSubscriptionDeleted(stripeSubscription) {
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: stripeSubscription.id
  });

  if (subscription) {
    subscription.status = 'canceled';
    subscription.canceledAt = new Date();
    await subscription.save();

    // Create notification
    await Notification.create({
      user: subscription.user,
      type: 'subscription_expiring',
      title: 'Subscription Canceled',
      message: 'Your subscription has been canceled. You can reactivate anytime.',
      actionUrl: '/plans'
    });
  }
}

// Handle successful payment
async function handlePaymentSucceeded(invoice) {
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: invoice.subscription
  });

  if (subscription) {
    await Payment.create({
      user: subscription.user,
      subscription: subscription._id,
      stripeChargeId: invoice.charge,
      amount: invoice.amount_paid / 100,
      currency: invoice.currency,
      plan: subscription.plan,
      billingCycle: subscription.billingCycle,
      status: 'succeeded'
    });
  }
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: invoice.subscription
  });

  if (subscription) {
    subscription.status = 'past_due';
    await subscription.save();

    await Payment.create({
      user: subscription.user,
      subscription: subscription._id,
      stripeChargeId: invoice.charge,
      amount: invoice.amount_due / 100,
      currency: invoice.currency,
      plan: subscription.plan,
      billingCycle: subscription.billingCycle,
      status: 'failed'
    });

    // Create notification
    await Notification.create({
      user: subscription.user,
      type: 'subscription_expiring',
      title: 'Payment Failed',
      message: 'Your subscription payment failed. Please update your payment method.',
      actionUrl: '/subscription/manage'
    });
  }
}

// @route   GET /api/subscriptions/my-subscription
// @desc    Get user's current subscription
// @access  Private
router.get('/my-subscription', protect, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ user: req.user._id });

    if (!subscription) {
      return res.json({
        success: true,
        subscription: null
      });
    }

    res.json({
      success: true,
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        billingCycle: subscription.billingCycle,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        features: subscription.features,
        isActive: subscription.isActive()
      }
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching subscription'
    });
  }
});

// @route   POST /api/subscriptions/cancel
// @desc    Cancel subscription
// @access  Private
router.post('/cancel', protect, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      user: req.user._id,
      status: 'active'
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    if (!subscription.stripeSubscriptionId) {
      return res.status(400).json({
        success: false,
        message: 'Subscription not linked to Stripe'
      });
    }

    // Cancel at period end in Stripe
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    subscription.cancelAtPeriodEnd = true;
    subscription.canceledAt = new Date();
    await subscription.save();

    res.json({
      success: true,
      message: 'Subscription will be canceled at the end of the billing period'
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Error canceling subscription'
    });
  }
});

// @route   GET /api/subscriptions/details
// @desc    Get detailed subscription info with features and benefits
// @access  Private
router.get('/details', protect, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ user: req.user._id });

    const planDetails = {
      basic: {
        name: 'Starter Spirit',
        description: 'Begin your spiritual journey',
        features: [
          'Basic browsing (10 profiles/day)',
          'Create profile',
          'View matches',
          'Community access'
        ],
        monthlyPrice: 4.99,
        yearlyPrice: 49.99
      },
      standard: {
        name: 'Spiritual Seeker',
        description: 'Deepen your connections',
        features: [
          'Unlimited browsing',
          'Full messaging',
          'See who likes you',
          'Basic filters',
          'Community events',
          'Soul check-ins'
        ],
        monthlyPrice: 9.99,
        yearlyPrice: 99.99
      },
      premium: {
        name: 'Divine Connection',
        description: 'Ultimate spiritual experience',
        features: [
          'Everything in Standard',
          'Advanced filters',
          'Profile boost',
          'Priority placement',
          'See profile views',
          'Match insights',
          'VIP support',
          'Spiritual coaching'
        ],
        monthlyPrice: 19.99,
        yearlyPrice: 199.99
      }
    };

    if (!subscription) {
      return res.json({
        success: true,
        subscription: null,
        availablePlans: planDetails
      });
    }

    const currentPlan = subscription.plan;
    const daysRemaining = subscription.endDate
      ? Math.ceil((new Date(subscription.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;

    res.json({
      success: true,
      subscription: {
        plan: subscription.plan,
        planDetails: planDetails[currentPlan],
        status: subscription.status,
        billingCycle: subscription.billingCycle,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
        features: subscription.features,
        isActive: subscription.isActive(),
        canceledAt: subscription.canceledAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
      },
      availablePlans: planDetails,
      upgradeSuggestion: currentPlan === 'basic' ? 'standard' : currentPlan === 'standard' ? 'premium' : null
    });
  } catch (error) {
    console.error('Get subscription details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching subscription details'
    });
  }
});

export default router;

