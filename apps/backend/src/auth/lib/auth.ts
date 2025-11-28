import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  trustedOrigins: Array.from(
    new Set(
      [
        process.env.FRONTEND_URL,
        process.env.NEXT_PUBLIC_API_URL,
        'http://localhost:3000',
        'http://localhost:3001',
      ].filter(Boolean) as string[],
    ),
  ),
  user: {
    modelName: 'BetterAuthUser',
  },
  session: {
    modelName: 'BetterAuthSession',
    expiresIn: 60 * 60 * 24, // 24h to match legacy JWT cookies
    updateAge: 60 * 60, // refresh once per hour when active
  },
  account: {
    modelName: 'BetterAuthAccount',
  },
  verification: {
    modelName: 'BetterAuthVerification',
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  advanced: {
    cookiePrefix: 'mandareen',
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      domain:
        process.env.BETTER_AUTH_COOKIE_DOMAIN ??
        (process.env.NODE_ENV !== 'production' ? '.localhost' : undefined),
    },
  },
  secret: process.env.BETTER_AUTH_SECRET!,
});

export type Auth = typeof auth;
