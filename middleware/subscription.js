const { dbQuery } = require('../database');

/**
 * Middleware to fetch and attach fresh subscription/tier details to req.userSubscription.
 * Also updates req.user.tier for quick reference.
 * If subscription has expired based on current_period_end, gracefully degrades tier to 'free'.
 */
async function attachSubscription(req, res, next) {
  if (!req.user || !req.user.id) {
    return next();
  }

  try {
    const user = await dbQuery.get(
      `SELECT tier, subscription_status, subscription_plan, subscription_id, subscription_current_period_end 
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    let effectiveTier = user.tier || 'free';
    let status = user.subscription_status || 'inactive';

    // Auto-check expiration if a period end is recorded
    if (effectiveTier === 'premium' && user.subscription_current_period_end) {
      const periodEnd = new Date(user.subscription_current_period_end).getTime();
      if (Number.isFinite(periodEnd) && Date.now() > periodEnd) {
        // Expired
        effectiveTier = 'free';
        status = 'expired';
        // Asynchronously update DB status so it stays synced
        dbQuery.run(
          `UPDATE users SET tier = 'free', subscription_status = 'expired' WHERE id = ?`,
          [req.user.id]
        ).catch(err => console.error('Failed to downgrade expired subscription:', err));
      }
    }

    req.userSubscription = {
      tier: effectiveTier,
      status,
      plan: user.subscription_plan,
      subscriptionId: user.subscription_id,
      currentPeriodEnd: user.subscription_current_period_end,
      isPremium: effectiveTier === 'premium'
    };

    req.user.tier = effectiveTier;
    next();
  } catch (err) {
    console.error('attachSubscription middleware error:', err);
    next();
  }
}

/**
 * Route protection middleware requiring active Premium tier.
 * Returns HTTP 403 with standard PREMIUM_REQUIRED error code.
 */
async function requirePremium(req, res, next) {
  // Ensure subscription details are attached
  if (!req.userSubscription) {
    return attachSubscription(req, res, () => {
      if (!req.userSubscription || !req.userSubscription.isPremium) {
        return res.status(403).json({
          error: 'This feature is only available on the Premium plan.',
          code: 'PREMIUM_REQUIRED',
          upgradeUrl: '/settings'
        });
      }
      next();
    });
  }

  if (!req.userSubscription.isPremium) {
    return res.status(403).json({
      error: 'This feature is only available on the Premium plan.',
      code: 'PREMIUM_REQUIRED',
      upgradeUrl: '/settings'
    });
  }

  next();
}

module.exports = {
  attachSubscription,
  requirePremium
};

