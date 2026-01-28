/**
 * Standardized Error Response Builder
 * 
 * Provides consistent error response format across all endpoints
 */

import type { FastifyReply } from 'fastify';
import { createStructuredError, ErrorType, type StructuredError } from './error-handler.js';

export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  retryable?: boolean;
  retryAfter?: number;
  details?: any;
}

/**
 * Send standardized error response
 */
export function sendErrorResponse(
  reply: FastifyReply,
  error: any,
  defaultMessage: string = 'An error occurred',
  defaultStatusCode: number = 500
): FastifyReply {
  const structuredError = createStructuredError(error);
  
  // Determine status code based on error type
  let statusCode = defaultStatusCode;
  switch (structuredError.type) {
    case ErrorType.VALIDATION:
      statusCode = 400;
      break;
    case ErrorType.NOT_FOUND:
      statusCode = 404;
      break;
    case ErrorType.INSUFFICIENT_BALANCE:
      statusCode = 402; // Payment Required
      break;
    case ErrorType.MARKET_CLOSED:
      statusCode = 409; // Conflict
      break;
    case ErrorType.RATE_LIMIT:
      statusCode = 429;
      break;
    case ErrorType.NETWORK:
    case ErrorType.EXTERNAL_API:
      statusCode = 502; // Bad Gateway
      break;
    case ErrorType.DATABASE:
      statusCode = 503; // Service Unavailable
      break;
    default:
      statusCode = defaultStatusCode;
  }

  const response: ErrorResponse = {
    success: false,
    error: structuredError.message || defaultMessage,
    code: structuredError.code,
    retryable: structuredError.retryable,
    retryAfter: structuredError.retryAfter,
  };

  // Only include details in development
  if (process.env.NODE_ENV === 'development') {
    response.details = structuredError.details;
  }

  return reply.status(statusCode).send(response);
}

/**
 * Send validation error response
 */
export function sendValidationError(
  reply: FastifyReply,
  errors: any[],
  message: string = 'Validation failed'
): FastifyReply {
  return reply.status(400).send({
    success: false,
    error: message,
    code: ErrorType.VALIDATION,
    details: errors,
  });
}

/**
 * Send not found error response
 */
export function sendNotFoundError(
  reply: FastifyReply,
  resource: string = 'Resource'
): FastifyReply {
  return reply.status(404).send({
    success: false,
    error: `${resource} not found`,
    code: ErrorType.NOT_FOUND,
  });
}

/**
 * Send unauthorized error response
 */
export function sendUnauthorizedError(
  reply: FastifyReply,
  message: string = 'Unauthorized'
): FastifyReply {
  return reply.status(401).send({
    success: false,
    error: message,
    code: 'UNAUTHORIZED',
  });
}

