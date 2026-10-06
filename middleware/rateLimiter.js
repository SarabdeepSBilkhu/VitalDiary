/**
 * Rate Limiters using express-rate-limit.
 * 
 * authLimiter  — applied to /api/auth routes (prevents brute-force login attacks)
 * aiLimiter    — applied to /api/ai routes (prevents API key abuse / cost runaway)
 */
const rateLimit = require('express-rate-limit');

/**
 * Authentication rate limiter.
 * 20 requests per 15-minute window per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts from this IP. Please try again in 15 minutes.'
  },
  // Skip rate limiting in test environment
  skip: () => process.env.NODE_ENV === 'test'
});

/**
 * AI assistant rate limiter.
 * 30 requests per minute per IP — generous for real usage but caps runaway loops.
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many AI requests from this IP. Please wait a moment before sending another message.'
  },
  skip: () => process.env.NODE_ENV === 'test'
});

module.exports = { authLimiter, aiLimiter };
