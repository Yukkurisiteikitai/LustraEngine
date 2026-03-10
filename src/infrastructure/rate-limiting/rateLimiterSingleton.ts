import { InMemorySlidingWindowRateLimiter } from './InMemorySlidingWindowRateLimiter';

export const chatRateLimiter = new InMemorySlidingWindowRateLimiter(
  parseInt(process.env.CHAT_RATE_LIMIT_MAX_TOKENS ?? '50000', 10),
  parseInt(process.env.CHAT_RATE_LIMIT_WINDOW_MS ?? String(60 * 60 * 1000), 10),
);
