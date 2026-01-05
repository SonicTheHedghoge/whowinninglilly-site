const { Redis } = require('@upstash/redis');

// Initialize Redis client (will be initialized on first request)
let redis = null;

function initializeRedis() {
  if (!redis) {
    try {
      redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
    } catch (error) {
      console.error('Redis initialization error:', error);
      throw new Error('Failed to initialize Redis connection');
    }
  }
}

module.exports = async (req, res) => {
  // Enable CORS for all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({
      error: 'Method not allowed'
    });
    return;
  }

  try {
    // Initialize Redis
    initializeRedis();
    
    // Get today's date for daily stats
    const today = new Date().toISOString().split('T')[0];

    // Fetch stats from Redis with error handling
    let totalAttempts, attemptsToday, totalWinners;
    
    try {
      const results = await Promise.allSettled([
        redis.get('total_attempts'),
        redis.get(`attempts_${today}`),
        redis.get('total_winners')
      ]);
      
      totalAttempts = results[0].status === 'fulfilled' ? results[0].value : 0;
      attemptsToday = results[1].status === 'fulfilled' ? results[1].value : 0;
      totalWinners = results[2].status === 'fulfilled' ? results[2].value : 0;
    } catch (redisError) {
      console.error('Redis fetch error:', redisError);
      // Return default values if Redis fails
      totalAttempts = 0;
      attemptsToday = 0;
      totalWinners = 0;
    }

    // Calculate remaining prizes (assuming 10 total prizes)
    const prizesRemaining = Math.max(0, 10 - parseInt(totalWinners || 0));

    res.status(200).json({
      totalAttempts: parseInt(totalAttempts || 0),
      attemptsToday: parseInt(attemptsToday || 0),
      winners: parseInt(totalWinners || 0),
      prizesRemaining
    });

  } catch (error) {
    console.error('Stats handler error:', error);
    res.status(500).json({
      error: 'Failed to fetch stats'
    });
  }
};
