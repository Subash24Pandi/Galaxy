const { createClient } = require('redis');

let redisClient = null;

const connectRedis = async () => {
  try {
    const client = createClient({
      url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      socket: {
        // Prevent infinite reconnection loops crashing Node
        reconnectStrategy: false 
      }
    });

    // We must handle the error event to prevent Node from throwing unhandled exceptions
    client.on('error', () => {
      // Intentionally swallow subsequent error events so Node doesn't log spam
    });

    await client.connect();
    console.log('Redis connected successfully');
    
    // Only assign it if connection succeeds
    redisClient = client;
  } catch (error) {
    // Requirements: Log only a warning
    console.warn('Redis unavailable, running without Redis');
    redisClient = null;
  }
};

module.exports = {
  connectRedis,
  getRedisClient: () => redisClient
};
