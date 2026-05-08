import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY;

async function listAllPrices() {
  try {
    const prices = await stripe.prices.list({ limit: 10, active: true });
    console.log('Active Prices in Account:');
    prices.data.forEach(p => {
      console.log(`- ID: ${p.id}, Product: ${p.product}, Amount: ${p.unit_amount / 100} ${p.currency}`);
    });
  } catch (err) {
    console.error('Error:', err.message);
  }
}

listAllPrices();
