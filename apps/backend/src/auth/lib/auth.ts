import { betterAuth } from 'better-auth';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../../email/email.service';

const prisma = new PrismaClient();

const baseURL =
  process.env.BETTER_AUTH_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3000';

const baseHost = new URL(baseURL).hostname;
const isLocalhost = baseHost === 'localhost' || baseHost === '127.0.0.1';
// Choose a cookie domain that matches the backend host. Avoid using .localhost in production.
const envCookieDomain = process.env.BETTER_AUTH_COOKIE_DOMAIN;
const cookieDomain =
  envCookieDomain &&
  envCookieDomain !== '.localhost' &&
  !envCookieDomain.includes('localhost')
    ? envCookieDomain
    : isLocalhost
      ? '.localhost'
      : baseHost;
const cookieSameSite = isLocalhost ? 'lax' : 'none';
const cookieSecure =
  process.env.BETTER_AUTH_COOKIE_SECURE === 'true' ||
  (!isLocalhost && baseURL.startsWith('https://')) ||
  process.env.NODE_ENV === 'production';

const emailVerificationEnabled =
  process.env.EMAIL_VERIFICATION_ENABLED !== 'false';

export function createAuthConfig(emailService: EmailService) {
  return betterAuth({
    baseURL,
    basePath: '/auth', // Override Better Auth default /api/auth to use /auth
    transports: { rest: true, rpc: true }, // expose both REST and RPC endpoints
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
          'https://unartificial-marion-enrapturedly.ngrok-free.dev',
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
      // Use database-backed OAuth state to avoid reliance on third-party cookies.
      // Skip the state cookie check to support browsers that block cross-site cookies (e.g., Brave).
      storeStateStrategy: 'database',
      skipStateCookieCheck: true,
    },
    verification: {
      modelName: 'BetterAuthVerification',
    },
    emailVerification: emailVerificationEnabled
      ? {
          sendVerificationEmail: async ({ user, url }) => {
            await emailService.sendVerificationEmail(user.email, url);
          },
          sendOnSignUp: true,
          sendOnSignIn: true,
          autoSignInAfterVerification: true,
          expiresIn: 3600, // 1 hour
        }
      : undefined,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: emailVerificationEnabled,
      password: {
        hash: hashPassword,
        verify: async ({
          hash,
          password,
        }: {
          hash: string;
          password: string;
        }) => {
          const isBcryptHash =
            hash.startsWith('$2a$') || hash.startsWith('$2b$');
          if (isBcryptHash) {
            return bcrypt.compare(password, hash);
          }
          return verifyPassword({ hash, password });
        },
      },
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
        secure: cookieSecure,
        sameSite: cookieSameSite,
        domain: cookieDomain,
        path: '/',
      },
    },
    secret: process.env.BETTER_AUTH_SECRET!,
  });
}

export type Auth = ReturnType<typeof createAuthConfig>;
