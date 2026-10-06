const { Redis } = require('@upstash/redis');

let redisClient = null;

// Initialize Upstash Redis if credentials are provided
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log('[cache] Connected to Upstash Redis for caching.');
  } catch (err) {
    console.error('[cache] Failed to initialize Redis:', err.message);
  }
} else {
  console.log('[cache] No Upstash Redis configuration found. Caching disabled.');
}

/**
 * Fetch a cached JSON value by key.
 * @param {string} key 
 * @returns {Promise<any|null>} Parsed JSON or null if not found/disabled.
 */
async function getCache(key) {
  if (!redisClient) return null;
  try {
    const data = await redisClient.get(key);
    // Upstash automatically parses JSON if it detects it, but we can return it safely.
    return data;
  } catch (err) {
    console.error(`[cache] get error for key ${key}:`, err.message);
    return null;
  }
}

/**
 * Set a JSON value in cache with a TTL (seconds).
 * @param {string} key 
 * @param {any} data 
 * @param {number} ttlSeconds Default 300 (5 mins)
 */
async function setCache(key, data, ttlSeconds = 300) {
  if (!redisClient) return;
  try {
    await redisClient.set(key, data, { ex: ttlSeconds });
  } catch (err) {
    console.error(`[cache] set error for key ${key}:`, err.message);
  }
}

/**
 * Delete all keys matching a specific pattern (e.g., "vitals:user_123*")
 * @param {string} matchPattern 
 */
async function invalidateCache(matchPattern) {
  if (!redisClient) return;
  try {
    let cursor = 0;
    const keysToDelete = [];
    // SCAN to find all matching keys
    do {
      const [nextCursor, keys] = await redisClient.scan(cursor, { match: matchPattern, count: 100 });
      cursor = Number(nextCursor);
      if (keys && keys.length > 0) {
        keysToDelete.push(...keys);
      }
    } while (cursor !== 0);

    if (keysToDelete.length > 0) {
      await redisClient.del(...keysToDelete);
    }
  } catch (err) {
    console.error(`[cache] invalidate error for pattern ${matchPattern}:`, err.message);
  }
}

module.exports = {
  getCache,
  setCache,
  invalidateCache
};
