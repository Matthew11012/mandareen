import {
  Injectable,
  UnauthorizedException,
  ExecutionContext,
} from '@nestjs/common';
import { CanActivate } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JWTPayload } from '../../types/request.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization as string | undefined;
    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else {
      // Allow token via query param for SSE/EventSource where headers aren't supported
      token = (request.query?.token as string | undefined) || undefined;
      // Fallback: read from Cookie header (HttpOnly auth-token)
      if (!token) {
        const cookieHeader = request.headers['cookie'] as string | undefined;
        if (cookieHeader) {
          const cookies = Object.fromEntries(
            cookieHeader.split(';').map((c: string) => {
              const idx = c.indexOf('=');
              const name = c.slice(0, idx).trim();
              const val = decodeURIComponent(c.slice(idx + 1));
              return [name, val];
            }),
          );
          token = cookies['auth-token'];
        }
      }
    }

    if (!token) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    try {
      const payload = this.jwtService.verify(token) as JWTPayload;

      // Find the user
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Attach user to request
      (request as any).user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
