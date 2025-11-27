import {
  CanActivate,
  ExecutionContext,
  Injectable,
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
      return true;
    }

    // 2. Fallback to legacy JWT.
    const legacyUser = await this.tryGetLegacyUser(
      request,
      this.jwtService,
      this.prisma,
    );
    if (!legacyUser) {
      throw new UnauthorizedException('No valid authentication');
    }
    request.user = legacyUser;
    request.authSource = 'legacy-jwt';
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
        return null;
      }

      return {
        id: baUser.legacyUser.id,
        email: baUser.legacyUser.email,
      };
    } catch {
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
      return user ?? null;
    } catch {
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
