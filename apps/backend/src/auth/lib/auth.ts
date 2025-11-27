import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
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
    },
  },
  secret: process.env.BETTER_AUTH_SECRET!,
});

export type Auth = typeof auth;
