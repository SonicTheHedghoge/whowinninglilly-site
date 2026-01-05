const { Redis } = require('@upstash/redis');

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
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
    const prizesRemaining = Math.max(0, 10 - parseInt(totalWinners));

    return res.status(200).json({
      totalAttempts: parseInt(totalAttempts),
      attemptsToday: parseInt(attemptsToday),
      winners: parseInt(totalWinners),
      prizesRemaining
    });

  } catch (error) {
    console.error('Stats error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch stats' 
    });
  }
}
