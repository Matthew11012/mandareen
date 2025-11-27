import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Handles linking between Better Auth users and legacy users.
 * Supports incremental migration by creating or updating mappings on demand.
 */
@Injectable()
export class UserMigrationService {
  private readonly logger = new Logger(UserMigrationService.name);
  private readonly prisma: PrismaService;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
  }

  /**
   * Attempt to link an existing legacy user to a Better Auth user by email.
   * Invoked when a BA user signs in but lacks legacy linkage.
   */
  async linkLegacyUser(baUserId: string, email: string): Promise<void> {
    const legacyUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!legacyUser) {
      return;
    }

    await this.prisma.betterAuthUser.update({
      where: { id: baUserId },
      data: { legacyUserId: legacyUser.id },
    });

    this.logger.log(
      `Linked Better Auth user ${baUserId} -> legacy ${legacyUser.id}`,
    );
  }

  /**
   * Ensure a Better Auth user exists (and is linked) for a legacy user id.
   * Returns the Better Auth user id if available/created, otherwise null.
   */
  async migrateFromLegacyJwt(legacyUserId: number): Promise<string | null> {
    const legacyUser = await this.prisma.user.findUnique({
      where: { id: legacyUserId },
      include: { betterAuthUser: true },
    });
    if (!legacyUser) {
      return null;
    }
    if (legacyUser.betterAuthUser) {
      return legacyUser.betterAuthUser.id;
    }

    const baUser = await this.prisma.betterAuthUser.create({
      data: {
        email: legacyUser.email,
        emailVerified: true,
        legacyUserId: legacyUser.id,
      },
    });

    if (legacyUser.googleId) {
      await this.prisma.betterAuthAccount.create({
        data: {
          userId: baUser.id,
          providerId: 'google',
          accountId: legacyUser.googleId,
        },
      });
    }

    if (legacyUser.password_hashed) {
      await this.prisma.betterAuthAccount.create({
        data: {
          userId: baUser.id,
          providerId: 'credential',
          accountId: legacyUser.email,
          password: legacyUser.password_hashed,
        },
      });
    }

    this.logger.log(
      `Migrated legacy user ${legacyUserId} -> Better Auth user ${baUser.id}`,
    );
    return baUser.id;
  }

  /**
   * Create a legacy user entry for a Better Auth-only signup to maintain
   * compatibility with parts of the system still expecting numeric user IDs.
   */
  async createLegacyUserForBaUser(
    baUserId: string,
    email: string,
  ): Promise<number> {
    const legacyUser = await this.prisma.user.create({
      data: {
        email,
        password_hashed: '',
      },
    });

    await this.prisma.betterAuthUser.update({
      where: { id: baUserId },
      data: { legacyUserId: legacyUser.id },
    });

    this.logger.log(
      `Created legacy user ${legacyUser.id} for Better Auth user ${baUserId}`,
    );
    return legacyUser.id;
  }
}
