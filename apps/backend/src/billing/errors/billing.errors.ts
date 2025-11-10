import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Error thrown when a user has exceeded their quota for a resource.
 * Returns HTTP 403 Forbidden.
 */
export class QuotaExceededError extends HttpException {
  constructor(
    public readonly resource: string,
    public readonly planCap: number,
    public readonly used: number,
    message?: string,
  ) {
    super(
      {
        code: 'QUOTA_EXCEEDED',
        message: message || `Quota exceeded for resource: ${resource}`,
        resource,
        planCap,
        used,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * Error thrown when a user has exceeded their rate limit (RPM/burst).
 * Returns HTTP 429 Too Many Requests.
 */
export class RateLimitedError extends HttpException {
  constructor(
    public readonly resource: string,
    public readonly retryAfter: number, // seconds
    message?: string,
  ) {
    super(
      {
        code: 'RATE_LIMITED',
        message: message || `Rate limit exceeded for resource: ${resource}`,
        resource,
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Error thrown when a user has exceeded their concurrency limit (e.g., too many SSE streams).
 * Returns HTTP 429 Too Many Requests.
 */
export class ConcurrencyLimitError extends HttpException {
  constructor(
    public readonly resource: string,
    public readonly limit: number,
    public readonly retryAfter: number, // seconds
    message?: string,
  ) {
    super(
      {
        code: 'CONCURRENCY_LIMIT',
        message:
          message ||
          `Concurrency limit exceeded for resource: ${resource} (limit: ${limit})`,
        resource,
        limit,
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Error thrown when webhook signature verification fails.
 * Returns HTTP 400 Bad Request.
 */
export class InvalidSignatureError extends HttpException {
  constructor(message?: string) {
    super(
      {
        code: 'INVALID_SIGNATURE',
        message: message || 'Invalid webhook signature',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Error thrown when checkout creation fails.
 * Returns HTTP 400/404/500 depending on the error.
 */
export class CheckoutError extends HttpException {
  constructor(
    public readonly reason: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    message?: string,
  ) {
    super(
      {
        code: 'CHECKOUT_ERROR',
        message: message || `Checkout failed: ${reason}`,
        reason,
      },
      statusCode,
    );
  }
}

/**
 * Error thrown when billing portal is not available or unsupported.
 * Returns HTTP 404 Not Found.
 */
export class PortalUnavailableError extends HttpException {
  constructor(message?: string) {
    super(
      {
        code: 'PORTAL_UNAVAILABLE',
        message: message || 'Billing portal is not available',
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
