import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { auth } from '../lib/auth';
import { UserMigrationService } from '../user-migration.service';

/**
 * Guard that enforces Better Auth sessions only.
 * Legacy JWT fallback has been removed (Phase 6.3).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userMigrationService: UserMigrationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const sessionUser = await this.tryGetBetterAuthSession(
      request,
      this.prisma,
      this.userMigrationService,
    );

    if (!sessionUser) {
      this.logger.debug('Better Auth session missing/invalid');
      throw new UnauthorizedException('Not authenticated');
    }

    request.user = sessionUser;
    request.authSource = 'better-auth';
    this.logger.debug(`Auth via Better Auth for user ${sessionUser.id}`);
    return true;
  }

  private async tryGetBetterAuthSession(
    request: any,
    prisma: PrismaService,
    migrationService: UserMigrationService,
  ): Promise<{ id: number; email: string } | null> {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user) {
        return null;
      }

      let baUser = await prisma.betterAuthUser.findUnique({
        where: { id: session.user.id },
        include: { legacyUser: true },
      });

      if (!baUser?.legacyUser) {
        await migrationService.linkLegacyUser(
          session.user.id,
          session.user.email,
        );
        baUser = await prisma.betterAuthUser.findUnique({
          where: { id: session.user.id },
          include: { legacyUser: true },
        });
        if (!baUser?.legacyUser) {
          const legacyId = await migrationService.createLegacyUserForBaUser(
            session.user.id,
            session.user.email,
          );
          return { id: legacyId, email: session.user.email };
        }
      }

      return {
        id: baUser.legacyUser.id,
        email: baUser.legacyUser.email,
      };
    } catch (error) {
      this.logger.debug(
        `Better Auth session lookup failed: ${(error as Error).message}`,
      );
      return null;
    }
  }
}

