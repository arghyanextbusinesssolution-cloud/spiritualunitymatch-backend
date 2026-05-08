import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function testWebhookLogic() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected.');

    const testUserId = process.argv[2] || '69aafee9048aeeba9d087353'; // Use the ID we found
    const plan = 'standard';
    
    console.log(`🧪 Testing webhook logic for user: ${testUserId} with plan: ${plan}`);

    // Simulate the session object Stripe would send
    const session = {
      id: 'cs_test_' + Date.now(),
      customer: 'cus_test_' + Date.now(),
      subscription: 'sub_test_' + Date.now(),
      amount_total: 1900,
      currency: 'usd',
      payment_intent: 'pi_test_' + Date.now(),
      metadata: {
        userId: testUserId,
        plan: plan,
        billingCycle: 'monthly'
      }
    };

    // We need to simulate handleCheckoutCompleted
    // Since it's not exported, we'll replicate the logic here for testing
    // or we could modify subscriptions.js to export it.
    
    console.log(`🔍 [TEST] Processing session ${session.id} for user ${testUserId}`);
    
    // Update User role
    const user = await User.findByIdAndUpdate(testUserId, { role: plan }, { new: true });
    if (!user) {
      throw new Error('User not found');
    }
    console.log(`✅ [TEST] User role updated to ${plan} for ${user.email}`);

    // Create or update subscription
    let userSubscription = await Subscription.findOne({ user: testUserId });
    const now = new Date();
    const nextMonth = new Date();
    nextMonth.setMonth(now.getMonth() + 1);

    if (!userSubscription) {
      userSubscription = new Subscription({
        user: testUserId,
        plan,
        status: 'active',
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        stripePriceId: 'price_test',
        billingCycle: 'monthly',
        startDate: now,
        endDate: nextMonth
      });
    } else {
      userSubscription.plan = plan;
      userSubscription.status = 'active';
      userSubscription.endDate = nextMonth;
    }

    userSubscription.updateFeatures();
    await userSubscription.save();
    console.log('✅ [TEST] Subscription saved');

    // Create payment record
    await Payment.create({
      user: testUserId,
      subscription: userSubscription._id,
      stripeSessionId: session.id,
      amount: session.amount_total / 100,
      currency: session.currency,
      plan,
      billingCycle: 'monthly',
      status: 'succeeded'
    });
    console.log('✅ [TEST] Payment record created');

    console.log('🎉 [TEST] Webhook logic test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ [TEST] Error:', error);
    process.exit(1);
  }
}

testWebhookLogic();
