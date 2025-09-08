// Custom request types to replace 'any' usage
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    id: number;
    email: string;
    levelPlaced?: number | null;
  };
}

export interface GoogleUser {
  email: string;
  googleId: string;
  firstName?: string;
  lastName?: string;
}

export interface JWTPayload {
  sub: number;
  email: string;
  iat?: number;
  exp?: number;
}
