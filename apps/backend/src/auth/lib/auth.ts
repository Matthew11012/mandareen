import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SCRYPT_KEY_LEN = 64;
const SCRYPT_CONFIG = {
  N: 16384,
  r: 16,
  p: 1,
  maxmem: 128 * 16384 * 16 * 2,
};

const hashWithScrypt = (password: string): string => {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(
    password.normalize('NFKC'),
    Buffer.from(salt, 'hex'),
    SCRYPT_KEY_LEN,
    SCRYPT_CONFIG,
  );
  return `${salt}:${derived.toString('hex')}`;
};

const verifyScryptHash = (hash: string, password: string): boolean => {
  const [salt, storedKey] = hash.split(':');
  if (!salt || !storedKey) {
    throw new Error('Invalid password hash');
  }
  const derived = scryptSync(
    password.normalize('NFKC'),
    Buffer.from(salt, 'hex'),
    SCRYPT_KEY_LEN,
    SCRYPT_CONFIG,
  );
  return timingSafeEqual(Buffer.from(storedKey, 'hex'), derived);
};

export const auth = betterAuth({
  baseURL:
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3000',
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
    password: {
      hash: async (password: string) => hashWithScrypt(password),
      verify: async ({
        hash,
        password,
      }: {
        hash: string;
        password: string;
      }) => {
        const isBcryptHash = hash.startsWith('$2a$') || hash.startsWith('$2b$');
        if (isBcryptHash) {
          return bcrypt.compare(password, hash);
        }
        return verifyScryptHash(hash, password);
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
