import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JWTPayload } from '../../types/request.types';
import { auth } from '../lib/auth';

/**
 * Guard that accepts either a Better Auth session or the legacy JWT.
 * This allows incremental migration without breaking existing clients.
 */
@Injectable()
export class DualAuthGuard implements CanActivate {
  private readonly jwtService: JwtService;
  private readonly prisma: PrismaService;
  private readonly logger = new Logger(DualAuthGuard.name);

  constructor(jwtService: JwtService, prisma: PrismaService) {
    this.jwtService = jwtService;
    this.prisma = prisma;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 1. Prefer Better Auth session if present.
    const session = await this.tryGetBetterAuthSession(request, this.prisma);
    if (session) {
      request.user = session;
      request.authSource = 'better-auth';
      this.logger.debug(`Auth via Better Auth for user ${session.id}`);
      return true;
    }

    // 2. Fallback to legacy JWT.
    const legacyUser = await this.tryGetLegacyUser(
      request,
      this.jwtService,
      this.prisma,
    );
    if (!legacyUser) {
      this.logger.debug('Legacy JWT fallback failed: token missing/invalid');
      throw new UnauthorizedException('No valid authentication');
    }
    request.user = legacyUser;
    request.authSource = 'legacy-jwt';
    this.logger.debug(`Auth via legacy JWT for user ${legacyUser.id}`);
    return true;
  }

  private async tryGetBetterAuthSession(
    request: any,
    prisma: PrismaService,
  ): Promise<{ id: number; email: string } | null> {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user) {
        return null;
      }

      const baUser = await prisma.betterAuthUser.findUnique({
        where: { id: session.user.id },
        include: { legacyUser: true },
      });

      if (!baUser?.legacyUser) {
        this.logger.debug(
          `Better Auth user ${session.user.id} missing legacy link`,
        );
        return null;
      }

      const mappedUser = {
        id: baUser.legacyUser.id,
        email: baUser.legacyUser.email,
      };
      this.logger.debug(
        `Mapped Better Auth user ${session.user.id} -> legacy user ${mappedUser.id}`,
      );
      return mappedUser;
    } catch {
      this.logger.debug('Better Auth session lookup failed');
      return null;
    }
  }

  private async tryGetLegacyUser(
    request: any,
    jwtService: JwtService,
    prisma: PrismaService,
  ): Promise<{ id: number; email: string } | null> {
    const token = this.extractLegacyToken(request);
    if (!token) {
      return null;
    }

    try {
      const payload = jwtService.verify(token) as JWTPayload;
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true },
      });
      if (!user) {
        this.logger.warn(`JWT valid but user ${payload.sub} not found`);
        return null;
      }
      return user;
    } catch (error) {
      this.logger.debug(`JWT verification failed: ${(error as Error).message}`);
      return null;
    }
  }

  private extractLegacyToken(request: any): string | undefined {
    const authHeader = request.headers.authorization as string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.split(' ')[1];
    }

    if (request.query?.token) {
      return request.query.token as string;
    }

    const cookieHeader = request.headers.cookie as string | undefined;
    if (cookieHeader) {
      const cookies = Object.fromEntries(
        cookieHeader.split(';').map((c: string) => {
          const idx = c.indexOf('=');
          return [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1))];
        }),
      );
      return cookies['auth-token'];
    }

    return undefined;
  }
}
