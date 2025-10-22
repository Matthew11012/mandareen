import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Minimal adapter to mimic Better Auth JWT issuance while we keep
 * the existing guards/middleware and cookie behavior unchanged.
 *
 * Claims and TTL must match legacy behavior to avoid breakage.
 */
@Injectable()
export class BetterAuthAdapter {
  constructor(private readonly jwtService: JwtService) {}

  issueJwt(user: { id: number; email: string }): string {
    return this.jwtService.sign({ sub: user.id, email: user.email });
  }
}
