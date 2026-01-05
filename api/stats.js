const { Redis } = require('@upstash/redis');

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  // Enable CORS for all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Get today's date for daily stats
    const today = new Date().toISOString().split('T')[0];

    // Fetch stats from Redis
    const [
      totalAttempts,
      attemptsToday,
      totalWinners
    ] = await Promise.all([
      redis.get('total_attempts') || 0,
      redis.get(`attempts_${today}`) || 0,
      redis.get('total_winners') || 0
    ]);

    // Calculate remaining prizes (assuming 10 total prizes)
    const prizesRemaining = Math.max(0, 10 - parseInt(totalWinners || 0));

    return res.status(200).json({
      totalAttempts: parseInt(totalAttempts || 0),
      attemptsToday: parseInt(attemptsToday || 0),
      winners: parseInt(totalWinners || 0),
      prizesRemaining
    });

  } catch (error) {
    console.error('Stats error:', error);
    return res.status(500).json({
      error: 'Failed to fetch stats'
    });
  }
}
