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
 * Plan catalog — amountPaise used to auto-create Razorpay Plans if env IDs are not set.
 */
const PLANS = {
  monthly: {
    id: 'monthly',
    name: 'VitalDiary Premium Monthly',
    amountPaise: 19900, // ₹199 in paise
    priceINR: 199,
    razorpayPeriod: 'monthly',  // Razorpay API period value
    durationDays: 30,
    get razorpayPlanId() { return process.env.RAZORPAY_PLAN_MONTHLY || null; }
  },
  yearly: {
    id: 'yearly',
    name: 'VitalDiary Premium Yearly',
    amountPaise: 199900, // ₹1,999 in paise
    priceINR: 1999,
    razorpayPeriod: 'yearly',
    durationDays: 365,
    get razorpayPlanId() { return process.env.RAZORPAY_PLAN_YEARLY || null; }
  }
};

/**
 * Lazily ensure a Razorpay Plan exists for the given PLANS entry.
 * Creates it via API if the env var is not set, then caches in process.env
 * so subsequent calls within the same process skip the API call.
 */
async function ensureRazorpayPlan(planKey) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error(`Unknown plan: ${planKey}`);

  // Already have a plan ID
  if (plan.razorpayPlanId) return plan.razorpayPlanId;

  const rzp = getRazorpay();
  if (!rzp) throw new Error('Razorpay not configured');

  // Create plan on Razorpay
  const created = await rzp.plans.create({
    period: plan.razorpayPeriod,
    interval: 1,
    item: {
      name: plan.name,
      amount: plan.amountPaise,
      currency: 'INR',
      description: `Auto-renewing ${plan.id} subscription to VitalDiary Premium`
    },
    notes: { planKey }
  });

  const envKey = planKey === 'monthly' ? 'RAZORPAY_PLAN_MONTHLY' : 'RAZORPAY_PLAN_YEARLY';
  process.env[envKey] = created.id;
  console.info(`[Subscription] Created Razorpay Plan ${created.id} for ${planKey}. Add ${envKey}=${created.id} to .env to avoid re-creating.`);
  return created.id;
}

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
 * 2. POST /api/subscription/create-order  (kept for backward compat — now creates a Razorpay Subscription)
 * Creates a Razorpay Subscription (auto-debit mandate) for the chosen plan.
 * The frontend receives a subscription_id which it passes to Razorpay Checkout
 * to register the e-mandate and collect the first payment in one step.
 */
router.post('/create-order', authenticateToken, async (req, res) => {
  const { plan = 'monthly' } = req.body;
  const selectedPlan = PLANS[plan] || PLANS.monthly;

  const rzp = getRazorpay();
  if (!rzp) {
    return res.status(400).json({
      error: 'Razorpay keys not configured on server. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env',
      code: 'RAZORPAY_NOT_CONFIGURED',
      demoModeAvailable: true
    });
  }

  try {
    // Ensure a Razorpay Plan exists (auto-creates if env var is not set)
    const razorpayPlanId = await ensureRazorpayPlan(plan);

    // Create a Razorpay Subscription with quantity=1, total_count drives auto-renewals
    // 6 years of AutoPay: total_count=72 for monthly (72 months), total_count=6 for yearly (6 years)
    const totalCount = plan === 'yearly' ? 6 : 72;

    const subscription = await rzp.subscriptions.create({
      plan_id: razorpayPlanId,
      total_count: totalCount,
      quantity: 1,
      customer_notify: 1,  // Razorpay sends its own debit notifications
      notes: {
        userId: String(req.user.id),
        userEmail: req.user.email,
        planId: selectedPlan.id,
        durationDays: String(selectedPlan.durationDays)
      }
    });

    res.json({
      // Return subscription_id instead of orderId so the frontend passes it to checkout
      subscriptionId: subscription.id,
      // Also expose as orderId so the frontend checkout options key still works
      orderId: null,
      isSubscription: true,
      amount: selectedPlan.amountPaise,
      currency: 'INR',
      keyId: (process.env.RAZORPAY_KEY_ID || '').replace(/^["']|["']$/g, '').trim(),
      plan: selectedPlan.id,
      planName: selectedPlan.name
    });
  } catch (err) {
    console.error('Error creating Razorpay subscription:', err);
    res.status(500).json({ error: 'Failed to create subscription: ' + (err.error?.description || err.message) });
  }
});

/**
 * 3. POST /api/subscription/verify-payment
 * Verifies a Razorpay Subscription first-charge signature and activates Premium.
 * 
 * Razorpay sends these fields in the checkout handler for subscriptions:
 *   razorpay_payment_id, razorpay_subscription_id, razorpay_signature
 * Signature = HMAC-SHA256(payment_id + "|" + subscription_id, secret)
 */
router.post('/verify-payment', authenticateToken, async (req, res) => {
  const {
    razorpay_payment_id,
    razorpay_subscription_id,
    razorpay_signature,
    // Legacy one-time order fields (kept for fallback)
    razorpay_order_id,
    plan = 'monthly'
  } = req.body;

  const key_secret = (process.env.RAZORPAY_KEY_SECRET || '').replace(/^["']|["']$/g, '').trim();
  if (!key_secret) {
    return res.status(500).json({ error: 'Razorpay secret key not configured.' });
  }

  try {
    let signatureValid = false;

    if (razorpay_subscription_id && razorpay_payment_id && razorpay_signature) {
      // ── Subscription signature verification ──────────────────────────────
      // HMAC-SHA256(payment_id + "|" + subscription_id, key_secret)
      const body = `${razorpay_payment_id}|${razorpay_subscription_id}`;
      const expected = crypto.createHmac('sha256', key_secret).update(body).digest('hex');
      signatureValid = (expected === razorpay_signature);
    } else if (razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      // ── Fallback: one-time order signature verification ───────────────────
      const body = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expected = crypto.createHmac('sha256', key_secret).update(body).digest('hex');
      signatureValid = (expected === razorpay_signature);
    } else {
      return res.status(400).json({ error: 'Missing payment signature verification parameters.' });
    }

    if (!signatureValid) {
      console.warn('Payment signature verification mismatch for user:', req.user.id);
      return res.status(400).json({ error: 'Payment verification failed: Invalid signature.' });
    }

    // Signature is authentic — activate Premium
    const selectedPlan = PLANS[plan] || PLANS.monthly;
    const expiresAt = new Date(Date.now() + selectedPlan.durationDays * 24 * 60 * 60 * 1000).toISOString();
    const subscriptionRef = razorpay_subscription_id || razorpay_payment_id;

    await dbQuery.run(
      `UPDATE users 
       SET tier = 'premium', 
           subscription_status = 'active', 
           subscription_plan = ?, 
           subscription_id = ?, 
           subscription_current_period_end = ? 
       WHERE id = ?`,
      [selectedPlan.id, subscriptionRef, expiresAt, req.user.id]
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

    // ── Helper: resolve userId from notes or DB via subscription_id ────────
    const resolveUserId = async (notes, subscriptionId) => {
      if (notes?.userId) return String(notes.userId);
      if (subscriptionId) {
        const row = await dbQuery.get(
          `SELECT id FROM users WHERE subscription_id = ? LIMIT 1`,
          [subscriptionId]
        );
        return row ? String(row.id) : null;
      }
      return null;
    };

    // ── 1. payment.captured — one-time or first charge of subscription ──────
    if (event === 'payment.captured') {
      const payment = payload.payload?.payment?.entity;
      const userId = await resolveUserId(payment?.notes, payment?.subscription_id);
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
          [planId, payment?.subscription_id || payment?.id, expiresAt, userId]
        );
        console.info(`[Webhook] payment.captured — Activated Premium for user ${userId} until ${expiresAt}`);
      } else {
        console.warn('[Webhook] payment.captured — could not resolve userId', payment?.notes);
      }

    // ── 2. order.paid — order fully settled ────────────────────────────────
    } else if (event === 'order.paid') {
      const order = payload.payload?.order?.entity;
      const payment = payload.payload?.payment?.entity;
      const userId = await resolveUserId(order?.notes || payment?.notes, null);
      const durationDays = parseInt(order?.notes?.durationDays || payment?.notes?.durationDays || '30', 10);
      const planId = order?.notes?.planId || payment?.notes?.planId || 'monthly';

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
          [planId, payment?.id || order?.id, expiresAt, userId]
        );
        console.info(`[Webhook] order.paid — Activated Premium for user ${userId} until ${expiresAt}`);
      } else {
        console.warn('[Webhook] order.paid — could not resolve userId', order?.notes);
      }

    // ── 3. payment.failed — card/UPI declined ──────────────────────────────
    } else if (event === 'payment.failed') {
      const payment = payload.payload?.payment?.entity;
      const userId = await resolveUserId(payment?.notes, payment?.subscription_id);
      if (userId) {
        await dbQuery.run(
          `UPDATE users SET subscription_status = 'past_due' WHERE id = ?`,
          [userId]
        );
        console.info(`[Webhook] payment.failed — marked user ${userId} as past_due`);
      } else {
        console.warn('[Webhook] payment.failed — could not resolve userId', payment?.notes);
      }

    // ── 4. refund.created — refund initiated (flag only, do not downgrade yet) ─
    } else if (event === 'refund.created') {
      const refund = payload.payload?.refund?.entity;
      const payment = payload.payload?.payment?.entity;
      const userId = await resolveUserId(refund?.notes || payment?.notes, null);
      if (userId) {
        // Mark as 'refund_pending' so the UI can show a banner, but keep premium access
        await dbQuery.run(
          `UPDATE users SET subscription_status = 'refund_pending' WHERE id = ?`,
          [userId]
        );
        console.info(`[Webhook] refund.created — marked user ${userId} as refund_pending (access retained until refund.processed)`);
      }

    // ── 5. refund.processed — refund settled; revoke premium access ─────────
    } else if (event === 'refund.processed') {
      const refund = payload.payload?.refund?.entity;
      const payment = payload.payload?.payment?.entity;
      const userId = await resolveUserId(refund?.notes || payment?.notes, null);
      if (userId) {
        await dbQuery.run(
          `UPDATE users 
           SET tier = 'free', 
               subscription_status = 'refunded',
               subscription_plan = NULL,
               subscription_current_period_end = datetime('now')
           WHERE id = ?`,
          [userId]
        );
        console.info(`[Webhook] refund.processed — downgraded user ${userId} to Free tier`);
      } else {
        console.warn('[Webhook] refund.processed — could not resolve userId', refund?.notes);
      }

    // ── 6. subscription.charged — recurring auto-debit succeeded ───────────
    } else if (event === 'subscription.charged') {
      const subscription = payload.payload?.subscription?.entity;
      const payment = payload.payload?.payment?.entity;
      const userId = await resolveUserId(subscription?.notes || payment?.notes, subscription?.id);
      const planId = subscription?.notes?.planId || payment?.notes?.planId || 'monthly';
      const durationDays = parseInt(subscription?.notes?.durationDays || payment?.notes?.durationDays || '30', 10);

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
          [planId, subscription?.id || payment?.id, expiresAt, userId]
        );
        console.info(`[Webhook] subscription.charged — Extended Premium for user ${userId} until ${expiresAt}`);
      } else {
        console.warn('[Webhook] subscription.charged — could not resolve userId', subscription?.notes);
      }

    // ── 7. subscription.cancelled — user cancelled AutoPay mandate ──────────
    } else if (event === 'subscription.cancelled') {
      const subscription = payload.payload?.subscription?.entity;
      const userId = await resolveUserId(subscription?.notes, subscription?.id);
      if (userId) {
        // Keep premium access until period end; just mark status as cancelled
        await dbQuery.run(
          `UPDATE users 
           SET subscription_status = 'cancelled',
               tier = CASE 
                 WHEN subscription_current_period_end > datetime('now') THEN tier 
                 ELSE 'free' 
               END
           WHERE id = ?`,
          [userId]
        );
        console.info(`[Webhook] subscription.cancelled — user ${userId} marked cancelled (access until period end)`);
      } else {
        console.warn('[Webhook] subscription.cancelled — could not resolve userId', subscription?.notes);
      }

    // ── 8. subscription.halted — repeated auto-debit failures ──────────────
    } else if (event === 'subscription.halted') {
      const subscription = payload.payload?.subscription?.entity;
      const userId = await resolveUserId(subscription?.notes, subscription?.id);
      if (userId) {
        // Halted = bank stopped the mandate; downgrade immediately
        await dbQuery.run(
          `UPDATE users 
           SET tier = 'free',
               subscription_status = 'halted'
           WHERE id = ?`,
          [userId]
        );
        console.info(`[Webhook] subscription.halted — downgraded user ${userId} to Free tier`);
      } else {
        console.warn('[Webhook] subscription.halted — could not resolve userId', subscription?.notes);
      }

    } else {
      console.info(`[Webhook] Unhandled event type: ${event}`);
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
