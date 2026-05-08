import express from 'express';
import Stripe from 'stripe';
import { protect } from '../middleware/auth.js';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import EventRegistration from '../models/EventRegistration.js';


const router = express.Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


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
// @desc    Create Stripe checkout session
// @access  Private
router.post('/create-checkout', protect, async (req, res) => {
  try {
    const plan = req.body.plan || req.body.planId;
    const billingCycle = req.body.billingCycle;

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

    const priceId = PLAN_PRICES[plan][billingCycle];

    if (!priceId || priceId.startsWith('price_')) {
        // If it's still the placeholder or missing, and we're not in a test mode that allows it
        if (priceId === 'price_basic_monthly' || priceId === 'price_basic_yearly' || 
            priceId === 'price_standard_yearly' || priceId === 'price_premium_yearly') {
            return res.status(400).json({
                success: false,
                message: `This plan option (${plan} ${billingCycle}) is not yet configured in Stripe.`
            });
        }
    }

    // Get or create Stripe customer
    let customerId;
    const user = await User.findById(req.user._id);
    
    if (user.stripeCustomerId) {
      customerId = user.stripeCustomerId;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: {
          userId: req.user._id.toString()
        }
      });
      customerId = customer.id;
      
      // Save customer ID to user
      user.stripeCustomerId = customerId;
      await user.save();
    }

    console.log(`🔗 [STRIPE] Creating session for user ${req.user.email} with plan ${plan}`);
    
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

    console.log(`✅ [STRIPE] Checkout URL created: ${session.url}`);

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url,
      redirectUrl: session.url
    });
  } catch (error) {
    console.error('❌ [STRIPE] Checkout creation failed!');
    console.error('❌ [STRIPE] Error Message:', error.message);
    console.error('❌ [STRIPE] Account being used (partial key):', process.env.STRIPE_SECRET_KEY?.substring(0, 10) + '...');
    
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
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  console.log('🔔 [WEBHOOK] Received Stripe webhook request');
  console.log('🔔 [WEBHOOK] Signature header present:', !!sig);

  try {
    // Verify webhook signature
    // Use rawBody captured in server.js if available, otherwise fallback to req.body
    const payload = req.rawBody || req.body;
    
    console.log('🔔 [WEBHOOK] Payload type:', typeof payload, 'isBuffer:', Buffer.isBuffer(payload));
    
    event = stripe.webhooks.constructEvent(
      payload,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log('✅ [WEBHOOK] Signature verified. Event Type:', event.type);
  } catch (err) {
    console.error('❌ [WEBHOOK] Signature verification failed!');
    console.error('❌ [WEBHOOK] Error:', err.message);
    console.error('❌ [WEBHOOK] Header Sig:', sig ? sig.substring(0, 20) + '...' : 'MISSING');
    console.error('❌ [WEBHOOK] Secret used (partial):', process.env.STRIPE_WEBHOOK_SECRET ? process.env.STRIPE_WEBHOOK_SECRET.substring(0, 10) + '...' : 'MISSING');
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('✅ [WEBHOOK] Event constructed successfully:', event.id);

  try {
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        console.log('💰 [WEBHOOK] Handling checkout.session.completed');
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
        console.log('📝 [WEBHOOK] Handling customer.subscription.created');
        await handleSubscriptionUpdated(event.data.object);
        break;
      
      case 'customer.subscription.updated':
        console.log('🔄 [WEBHOOK] Handling customer.subscription.updated');
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        console.log('🗑️ [WEBHOOK] Handling customer.subscription.deleted');
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        console.log('💵 [WEBHOOK] Handling invoice.payment_succeeded');
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        console.log('⚠️ [WEBHOOK] Handling invoice.payment_failed');
        await handlePaymentFailed(event.data.object);
        break;
      
      default:
        console.log('ℹ️ [WEBHOOK] Unhandled event type:', event.type);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ [WEBHOOK] Handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Handle checkout completion
async function handleCheckoutCompleted(session) {
  try {
    const metadata = session.metadata || {};
    const userId = metadata.userId;
    
    console.log(`🔍 [WEBHOOK] Processing session ${session.id}`);
    console.log(`🔍 [WEBHOOK] User ID from metadata: ${userId}`);
    console.log(`🔍 [WEBHOOK] Metadata:`, JSON.stringify(metadata, null, 2));

    if (metadata.type === 'event_registration') {
      const eventId = metadata.eventId;
      console.log(`✅ [WEBHOOK] Handling event registration for user ${userId} and event ${eventId}`);
      
      const registration = await EventRegistration.findOne({ 
        event: eventId, 
        user: userId 
      });
      
      if (registration) {
        registration.paymentStatus = 'completed';
        registration.stripeSessionId = session.id;
        await registration.save();
        console.log(`✅ [WEBHOOK] Registration updated to completed for event ${eventId}`);
      } else {
        await EventRegistration.create({
          event: eventId,
          user: userId,
          paymentStatus: 'completed',
          stripeSessionId: session.id
        });
        console.log(`✅ [WEBHOOK] New registration created for event ${eventId}`);
      }

      // Create payment record for event
      await Payment.create({
        user: userId,
        stripeSessionId: session.id,
        stripePaymentIntentId: session.payment_intent,
        amount: session.amount_total / 100,
        currency: session.currency,
        status: 'succeeded',
        metadata: { eventId, type: 'event_registration' }
      });

      // Create notification
      await Notification.create({
        user: userId,
        type: 'event_reminder',
        title: 'Event Registration Confirmed',
        message: `Your payment for the event has been confirmed!`,
        actionUrl: `/events/${eventId}`
      });

      return;
    }

    // Handle Subscription
    const plan = metadata.plan;
    const billingCycle = metadata.billingCycle;

    if (!plan) {
      console.log('⚠️ [WEBHOOK] No plan found in metadata, skipping subscription handling');
      return;
    }

    console.log(`📦 [WEBHOOK] Activating ${plan} (${billingCycle}) for user ${userId}`);

    // Get subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    console.log(`🎫 [WEBHOOK] Stripe Subscription retrieved: ${subscription.id}`);


    // Create or update subscription in database
    let userSubscription = await Subscription.findOne({ user: userId });

    if (!userSubscription) {
      console.log('🆕 [WEBHOOK] Creating new subscription record');
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
      console.log('🔄 [WEBHOOK] Updating existing subscription record');
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
    console.log('✅ [WEBHOOK] Subscription saved to database');

    // CRITICAL: Update User role so frontend and other routes know they are upgraded
    const updatedUser = await User.findByIdAndUpdate(userId, { role: plan }, { new: true });
    console.log(`✅ [WEBHOOK] User role updated to ${plan} for ${updatedUser?.email}`);

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
    console.log('✅ [WEBHOOK] Payment record created');

    // Create notification
    await Notification.create({
      user: userId,
      type: 'subscription_activated',
      title: 'Subscription Activated',
      message: `Your ${plan} subscription has been activated!`,
      actionUrl: '/dashboard'
    });

    console.log(`🎉 [WEBHOOK] SUCCESS: Subscription activated for user ${userId}`);
  } catch (error) {
    console.error('❌ [WEBHOOK] Error in handleCheckoutCompleted:', error);
    // We don't re-throw here so the webhook response (200) can still be sent, 
    // but the error is logged for debugging.
  }
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

    // Reset user role to basic
    await User.findByIdAndUpdate(subscription.user, { role: 'basic' });
    console.log(`🗑️ [WEBHOOK] User role reset to basic for user ${subscription.user}`);

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
        name: 'Dating Basic',
        description: 'Deepen your connections',
        features: [
          'Unlimited browsing',
          'Full messaging',
          'See who likes you',
          'Basic filters',
          'Community events',
          'Soul check-ins'
        ],
        monthlyPrice: 19.00,
        yearlyPrice: 190.00
      },
      premium: {
        name: 'Dating Premium',
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
        monthlyPrice: 39.00,
        yearlyPrice: 390.00
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

