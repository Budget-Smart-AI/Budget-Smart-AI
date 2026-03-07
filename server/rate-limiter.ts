interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore: Map<string, RateLimitEntry> = new Map();

setInterval(() => {
  const now = Date.now();
  const keys = Array.from(rateLimitStore.keys());
  for (const key of keys) {
    const entry = rateLimitStore.get(key);
    if (entry && entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

export function createRateLimiter(config: RateLimitConfig) {
  return (req: any, res: any, next: any) => {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const userId = req.session?.userId || "anonymous";
    const key = `${ip}:${userId}:${req.path}`;
    
    const now = Date.now();
    let entry = rateLimitStore.get(key);
    
    if (!entry || entry.resetAt < now) {
      entry = {
        count: 1,
        resetAt: now + config.windowMs
      };
      rateLimitStore.set(key, entry);
    } else {
      entry.count++;
    }
    
    res.setHeader("X-RateLimit-Limit", config.maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, config.maxRequests - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));
    
    if (entry.count > config.maxRequests) {
      // Fire-and-forget audit log for rate limit exceeded
      import("./audit-logger").then(({ auditLog, getClientIp }) => {
        auditLog({
          eventType: "security.rate_limit_exceeded",
          eventCategory: "security",
          actorId: userId === "anonymous" ? null : userId,
          actorIp: getClientIp(req),
          actorUserAgent: req.headers?.["user-agent"] ?? null,
          action: "rate_limit_exceeded",
          outcome: "blocked",
          metadata: { path: req.path, ip },
        });
      }).catch((err) => {
        console.error("[RateLimiter] Failed to write audit entry:", err);
      });

      return res.status(429).json({
        error: config.message || "Too many requests, please try again later"
      });
    }
    
    next();
  };
}

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  message: "Too many authentication attempts, please try again in 15 minutes"
});

export const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 500,
  message: "Too many requests, please slow down"
});

export const sensitiveApiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: "Too many requests to sensitive endpoint, please slow down"
});
