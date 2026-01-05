const { Redis } = require('@upstash/redis');
const { Resend } = require('resend');

// Video URLs
const WINNING_VIDEO = 'https://www.youtube.com/watch?v=7Gw57AxsgMY';
const SAFE_VIDEOS = [
  'https://www.youtube.com/watch?v=RzVvThhjAKw',
  'https://www.youtube.com/watch?v=AKeUssuu3Is',
  'https://www.youtube.com/watch?v=oSfVgn7oC_I',
  'https://www.youtube.com/watch?v=LjCzPp-MK48',
  'https://www.youtube.com/watch?v=FV9a4ro5ecw',
  'https://www.youtube.com/watch?v=pZVdQLn_E5w',
  'https://www.youtube.com/watch?v=8dRnTwuFYS4',
  'https://www.youtube.com/watch?v=VNu15Qqomt8',
  'https://www.youtube.com/watch?v=KLuTLF3x9sA',
  'https://www.youtube.com/watch?v=UV0mhY2Dxr0'
];

// Initialize clients (will be initialized on first request)
let redis = null;
let resend = null;

function initializeClients() {
  // Check if already initialized
  if (redis && resend) {
    return;
  }

  // Get and clean environment variables
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL 
    ? process.env.UPSTASH_REDIS_REST_URL.trim() 
    : null;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN 
    ? process.env.UPSTASH_REDIS_REST_TOKEN.trim() 
    : null;
  const resendKey = process.env.RESEND_API_KEY 
    ? process.env.RESEND_API_KEY.trim() 
    : null;

  // Validate Redis credentials
  if (!redisUrl || !redisToken) {
    throw new Error('Missing Redis credentials. Please check environment variables.');
  }

  if (redisUrl.includes(' ') || redisUrl.includes('\n') || redisUrl.includes('\r')) {
    throw new Error('Redis URL contains invalid whitespace characters. Please check your environment variable.');
  }

  if (redisToken.includes(' ') || redisToken.includes('\n') || redisToken.includes('\r')) {
    throw new Error('Redis token contains invalid whitespace characters. Please check your environment variable.');
  }

  if (!redisUrl.startsWith('https://')) {
    throw new Error('Invalid Redis URL format. Must start with https://');
  }

  try {
    redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });
  } catch (error) {
    console.error('Redis initialization error:', error);
    throw new Error('Failed to initialize Redis connection: ' + error.message);
  }
  
  try {
    resend = new Resend(resendKey);
  } catch (error) {
    console.error('Resend initialization error:', error);
    throw new Error('Failed to initialize email service: ' + error.message);
  }
}

module.exports = async (req, res) => {
  // Enable CORS for all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
    return;
  }

  try {
    // Initialize clients
    initializeClients();
    
    const { email } = req.body;

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
      return;
    }

    // Check if email already participated
    let existingEntry;
    try {
      existingEntry = await redis.get(`participant:${email}`);
    } catch (redisError) {
      console.error('Redis get error:', redisError);
      res.status(500).json({
        success: false,
        message: 'Database error. Please try again.'
      });
      return;
    }
    
    if (existingEntry) {
      res.status(400).json({
        success: false,
        message: 'You have already participated in this contest.'
      });
      return;
    }

    // Determine if winner (0.01% chance)
    const isWinner = Math.random() < 0.0001;

    // Select video
    const videoLink = isWinner
      ? WINNING_VIDEO
      : SAFE_VIDEOS[Math.floor(Math.random() * SAFE_VIDEOS.length)];

    // Store participant data
    try {
      await redis.set(
        `participant:${email}`,
        JSON.stringify({
          email,
          isWinner,
          videoLink,
          timestamp: new Date().toISOString()
        }),
        { ex: 60 * 60 * 24 * 30 } // Expire after 30 days
      );
    } catch (redisError) {
      console.error('Redis set error:', redisError);
      res.status(500).json({
        success: false,
        message: 'Failed to save your entry. Please try again.'
      });
      return;
    }

    // Update stats
    try {
      const today = new Date().toISOString().split('T')[0];
      await redis.incr('total_attempts');
      await redis.incr(`attempts_${today}`);
      if (isWinner) {
        await redis.incr('total_winners');
      }
    } catch (statsError) {
      console.error('Stats update error:', statsError);
      // Don't fail the request if stats update fails
    }

    // Send email
    try {
      const emailContent = `
Thank you for participating! Here is your mystery video:

${videoLink}

${isWinner
  ? 'Congratulations! You received The Red Spider Lily and are a WINNER! DM @WhoWinningLilly on Instagram immediately to claim your prize.'
  : 'If you received The Red Spider Lily, you are a winner! DM @WhoWinningLilly on Instagram immediately to claim your prize.'}

One entry per person. Good luck!
`;

      await resend.emails.send({
        from: 'WhoWinningLilly <onboarding@resend.dev>',
        to: email,
        subject: 'Your WhoWinningLilly Fate Revealed',
        text: emailContent,
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      // Don't fail the request if email fails - still show success to user
    }

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Your entry has been submitted! Check your email for your mystery video.',
      isWinner
    });

  } catch (error) {
    console.error('Submission handler error:', error);
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred: ' + error.message
    });
  }
};
