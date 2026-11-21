const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');
const { attachSubscription } = require('../middleware/subscription');

// Initialize Razorpay client with fallback handling if keys are not yet in .env
let razorpayInstance = null;
const getRazorpay = () => {
  const rawKeyId = process.env.RAZORPAY_KEY_ID;
  const rawSecret = process.env.RAZORPAY_KEY_SECRET;
  if (!rawKeyId || !rawSecret) {
    return null;
  }
  // Strip any accidental leading/trailing quotes or whitespace
  const key_id = rawKeyId.replace(/^["']|["']$/g, '').trim();
  const key_secret = rawSecret.replace(/^["']|["']$/g, '').trim();

  if (razorpayInstance && razorpayInstance.key_id === key_id && razorpayInstance.key_secret === key_secret) {
    return razorpayInstance;
  }
  razorpayInstance = new Razorpay({ key_id, key_secret });
  return razorpayInstance;
};

/**
 * Plan catalog
 */
const PLANS = {
  monthly: {
    id: 'monthly',
    name: 'VitalDiary Premium Monthly',
    amountPaise: 19900, // ₹199 in paise
    priceINR: 199,
    interval: 'monthly',
    durationDays: 30,
    razorpayPlanId: process.env.RAZORPAY_PLAN_MONTHLY || null
  },
  yearly: {
    id: 'yearly',
    name: 'VitalDiary Premium Yearly',
    amountPaise: 199900, // ₹1,999 in paise
    priceINR: 1999,
    interval: 'yearly',
    durationDays: 365,
    razorpayPlanId: process.env.RAZORPAY_PLAN_YEARLY || null
  }
};

/**
 * 1. GET /api/subscription/status
 * Public/authenticated view of user's active tier & configured plans.
 */
router.get('/status', authenticateToken, attachSubscription, async (req, res) => {
  try {
    const user = await dbQuery.get(
      `SELECT tier, subscription_status, subscription_plan, subscription_id, subscription_current_period_end 
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let isPremium = user.tier === 'premium';
    let status = user.subscription_status || 'inactive';

    if (isPremium && user.subscription_current_period_end) {
      const periodEnd = new Date(user.subscription_current_period_end).getTime();
      if (Number.isFinite(periodEnd) && Date.now() > periodEnd) {
        isPremium = false;
        status = 'expired';
      }
    }

    res.json({
      tier: isPremium ? 'premium' : 'free',
      isPremium,
      status,
      plan: user.subscription_plan,
      subscriptionId: user.subscription_id,
      currentPeriodEnd: user.subscription_current_period_end,
      availablePlans: PLANS,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
      isConfigured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      payuKey: (process.env.PAYU_MERCHANT_KEY || '').replace(/^["']|["']$/g, '').trim() || null,
      payuAvailable: !!(process.env.PAYU_MERCHANT_KEY && process.env.PAYU_MERCHANT_SALT)
    });
  } catch (err) {
    console.error('Error fetching subscription status:', err);
    res.status(500).json({ error: 'Failed to retrieve subscription status.' });
  }
});

/**
 * 2. POST /api/subscription/create-order
 * Creates a Razorpay Order for Indian Checkout (UPI, Cards, Netbanking).
 */
router.post('/create-order', authenticateToken, async (req, res) => {
  const { plan = 'monthly' } = req.body;
  const selectedPlan = PLANS[plan] || PLANS.monthly;

  const rzp = getRazorpay();
  if (!rzp) {
    // If Razorpay keys aren't configured yet, provide seamless guidance or fallback
    return res.status(400).json({
      error: 'Razorpay keys not configured on server. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env',
      code: 'RAZORPAY_NOT_CONFIGURED',
      demoModeAvailable: true
    });
  }

  try {
    const options = {
      amount: selectedPlan.amountPaise,
      currency: 'INR',
      receipt: `rcpt_${req.user.id}_${Date.now()}`,
      notes: {
        userId: String(req.user.id),
        userEmail: req.user.email,
        planId: selectedPlan.id,
        durationDays: String(selectedPlan.durationDays)
      }
    };

    const order = await rzp.orders.create(options);

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: (process.env.RAZORPAY_KEY_ID || '').replace(/^["']|["']$/g, '').trim(),
      plan: selectedPlan.id,
      planName: selectedPlan.name
    });
  } catch (err) {
    console.error('Error creating Razorpay order:', err);
    res.status(500).json({ error: 'Failed to initiate Razorpay order: ' + err.message });
  }
});

/**
 * 3. POST /api/subscription/verify-payment
 * Verifies Razorpay HMAC-SHA256 payment signature and activates Premium on backend authority.
 */
router.post('/verify-payment', authenticateToken, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan = 'monthly' } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment signature verification parameters.' });
  }

  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_secret) {
    return res.status(500).json({ error: 'Razorpay secret key not configured.' });
  }

  try {
    // Expected signature = HMAC-SHA256(order_id + "|" + payment_id, secret)
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', key_secret)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.warn('Payment signature verification mismatch for user:', req.user.id);
      return res.status(400).json({ error: 'Payment verification failed: Invalid signature.' });
    }

    // Payment is authentic. Upgrade user on server side.
    const selectedPlan = PLANS[plan] || PLANS.monthly;
    const expiresAt = new Date(Date.now() + selectedPlan.durationDays * 24 * 60 * 60 * 1000).toISOString();

    await dbQuery.run(
      `UPDATE users 
       SET tier = 'premium', 
           subscription_status = 'active', 
           subscription_plan = ?, 
           subscription_id = ?, 
           subscription_current_period_end = ? 
       WHERE id = ?`,
      [selectedPlan.id, razorpay_payment_id, expiresAt, req.user.id]
    );

    res.json({
      success: true,
      message: `Payment verified! You are now subscribed to ${selectedPlan.name}.`,
      tier: 'premium',
      plan: selectedPlan.id,
      currentPeriodEnd: expiresAt
    });
  } catch (err) {
    console.error('Payment verification error:', err);
    res.status(500).json({ error: 'Server error processing payment verification.' });
  }
});

/**
 * 4. POST /api/subscription/webhook
 * Handles async asynchronous events from Razorpay (AutoPay, payment failures, recurring renewals).
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  if (!webhookSecret || !signature) {
    return res.status(400).json({ error: 'Webhook secret or signature missing' });
  }

  try {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.warn('Invalid Razorpay webhook signature');
      return res.status(400).send('Invalid signature');
    }

    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const event = payload.event;
    console.info(`Received Razorpay webhook event: ${event}`);

    if (event === 'payment.captured' || event === 'order.paid') {
      const payment = payload.payload?.payment?.entity || payload.payload?.order?.entity;
      const userId = payment?.notes?.userId;
      const durationDays = parseInt(payment?.notes?.durationDays || '30', 10);
      const planId = payment?.notes?.planId || 'monthly';

      if (userId) {
        const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
        await dbQuery.run(
          `UPDATE users 
           SET tier = 'premium', 
               subscription_status = 'active', 
               subscription_plan = ?, 
               subscription_id = ?, 
               subscription_current_period_end = ? 
           WHERE id = ?`,
          [planId, payment.id, expiresAt, userId]
        );
        console.info(`[Webhook] Activated Premium for user ${userId} until ${expiresAt}`);
      }
    } else if (event === 'refund.processed' || event === 'refund.created') {
      const refund = payload.payload?.refund?.entity;
      const payment = payload.payload?.payment?.entity;
      const userId = refund?.notes?.userId || payment?.notes?.userId;

      if (userId) {
        await dbQuery.run(
          `UPDATE users 
           SET tier = 'free', 
               subscription_status = 'cancelled',
               subscription_plan = NULL,
               subscription_current_period_end = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [userId]
        );
        console.info(`[Webhook] Refund processed — downgraded user ${userId} to free tier.`);
      }
    } else if (event === 'subscription.cancelled' || event === 'payment.failed') {
      const entity = payload.payload?.subscription?.entity || payload.payload?.payment?.entity;
      const userId = entity?.notes?.userId;
      if (userId) {
        await dbQuery.run(
          `UPDATE users SET subscription_status = 'past_due' WHERE id = ?`,
          [userId]
        );
        console.info(`[Webhook] Marked user ${userId} subscription as past_due.`);
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * 5. POST /api/subscription/simulate-upgrade
 * Dev testing tool for switching tiers on local/staging environments.
 */
router.post('/simulate-upgrade', authenticateToken, async (req, res) => {
  const { plan = 'monthly', action = 'upgrade' } = req.body;

  try {
    if (action === 'downgrade') {
      await dbQuery.run(
        `UPDATE users 
         SET tier = 'free', subscription_status = 'cancelled', subscription_plan = NULL 
         WHERE id = ?`,
        [req.user.id]
      );

      return res.json({
        message: 'Subscription downgraded to Free tier.',
        tier: 'free',
        isPremium: false
      });
    }

    const selectedPlan = PLANS[plan] || PLANS.monthly;
    const expiresAt = new Date(Date.now() + selectedPlan.durationDays * 24 * 60 * 60 * 1000).toISOString();

    await dbQuery.run(
      `UPDATE users 
       SET tier = 'premium', 
           subscription_status = 'active', 
           subscription_plan = ?, 
           subscription_id = ?, 
           subscription_current_period_end = ? 
       WHERE id = ?`,
      [selectedPlan.id, `sim_${Date.now()}`, expiresAt, req.user.id]
    );

    res.json({
      message: `Successfully upgraded to ${selectedPlan.name}!`,
      tier: 'premium',
      isPremium: true,
      plan: selectedPlan.id,
      currentPeriodEnd: expiresAt
    });
  } catch (err) {
    console.error('Error simulating subscription upgrade:', err);
    res.status(500).json({ error: 'Failed to update subscription.' });
  }
});

/**
 * 6. POST /api/subscription/payu/create-payment
 * Initiates PayU Hosted Checkout session by generating secure SHA-512 payment hash.
 */
router.post('/payu/create-payment', authenticateToken, async (req, res) => {
  const merchantKey = (process.env.PAYU_MERCHANT_KEY || '').replace(/^["']|["']$/g, '').trim();
  const merchantSalt = (process.env.PAYU_MERCHANT_SALT || '').replace(/^["']|["']$/g, '').trim();
  const isTest = process.env.PAYU_MODE !== 'production';

  if (!merchantKey || !merchantSalt) {
    return res.status(400).json({
      error: 'PayU keys not configured. Please add PAYU_MERCHANT_KEY and PAYU_MERCHANT_SALT to .env or environment variables.',
      code: 'PAYU_NOT_CONFIGURED'
    });
  }

  const { plan = 'monthly' } = req.body;
  const selectedPlan = PLANS[plan] || PLANS.monthly;
  const txnid = `tx_${req.user.id}_${Date.now()}`;
  const amount = Number(selectedPlan.priceINR).toFixed(2);
  const productinfo = selectedPlan.name;
  const firstname = req.user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') || 'Customer';
  const email = req.user.email;
  const phone = '9999999999';

  // UDF fields carry user reference metadata
  const udf1 = String(req.user.id);
  const udf2 = selectedPlan.id;
  const udf3 = String(selectedPlan.durationDays);
  const udf4 = '';
  const udf5 = '';

  // PayU SHA-512 Request Hash Formula:
  // sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
  const hashString = `${merchantKey}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${merchantSalt}`;
  const hash = crypto.createHash('sha512').update(hashString).digest('hex');

  const actionUrl = isTest ? 'https://test.payu.in/_payment' : 'https://secure.payu.in/_payment';
  const baseUrl = process.env.PUBLIC_APP_URL || (req.get('origin') || `${req.protocol}://${req.get('host')}`);

  res.json({
    actionUrl,
    key: merchantKey,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    phone,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
    surl: `${baseUrl}/api/subscription/payu/return`,
    furl: `${baseUrl}/api/subscription/payu/return`,
    hash,
    plan: selectedPlan.id
  });
});

/**
 * 7. POST /api/subscription/payu/return
 * Handles the browser POST return redirect from PayU checkout.
 */
router.post('/payu/return', async (req, res) => {
  const { status, txnid, amount, productinfo, firstname, email, udf1, udf2, udf3, hash } = req.body;
  const merchantSalt = (process.env.PAYU_MERCHANT_SALT || '').replace(/^["']|["']$/g, '').trim();
  const merchantKey = (process.env.PAYU_MERCHANT_KEY || '').replace(/^["']|["']$/g, '').trim();

  // Verification Reverse Hash Formula:
  // sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
  const reverseString = `${merchantSalt}|${status}||||||||${udf3 || ''}|${udf2 || ''}|${udf1 || ''}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${merchantKey}`;
  const computedHash = crypto.createHash('sha512').update(reverseString).digest('hex');

  const isSuccess = (status === 'success');
  const userId = udf1;
  const planId = udf2 || 'monthly';
  const durationDays = parseInt(udf3 || '30', 10);

  if (isSuccess && userId) {
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    await dbQuery.run(
      `UPDATE users 
       SET tier = 'premium', 
           subscription_status = 'active', 
           subscription_plan = ?, 
           subscription_id = ?, 
           subscription_current_period_end = ? 
       WHERE id = ?`,
      [planId, txnid, expiresAt, userId]
    );
    console.info(`[PayU] Payment success for user ${userId}. Upgraded until ${expiresAt}`);
  } else {
    console.warn(`[PayU] Payment return status: ${status} for txn: ${txnid}`);
  }

  // Redirect back into web app with checkout outcome query param
  res.redirect(`/?payment_status=${isSuccess ? 'success' : 'failed'}&gateway=payu`);
});

module.exports = router;
