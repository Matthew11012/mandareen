import { Controller, Query, Req, Sse, UseGuards } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('lessons')
export class LessonsStreamController {
  constructor(private readonly lessonsService: LessonsService) {}

  // Public SSE endpoint; token is validated inside LessonsService
  @UseGuards(JwtAuthGuard)
  @Sse('generate/stream')
  streamGenerate(
    @Req() req: any,
    @Query('type') type?: 'story' | 'dialogue',
    @Query('level') level?: string,
    @Query('readTimeMinutes') readTimeMinutes?: string,
    @Query('topic') topic?: string,
    @Query('requestId') requestId?: string,
  ) {
    // Prefer using the cookie-based auth; JwtAuthGuard has already validated the token
    // We still extract the cookie value to reuse the existing service method
    const cookieHeader: string | undefined = req?.headers?.cookie;
    let token: string | undefined = req?.cookies?.['auth-token'];
    if (!token && cookieHeader) {
      try {
        const map = Object.fromEntries(
          cookieHeader.split(';').map((c: string) => {
            const idx = c.indexOf('=');
            const name = c.slice(0, idx).trim();
            const val = decodeURIComponent(c.slice(idx + 1));
            return [name, val];
          }),
        );
        token = map['auth-token'];
      } catch {
        token = undefined;
      }
    }
    if (!token) {
      throw new Error('Unauthorized');
    }
    return this.lessonsService.streamGenerateWithToken(token, {
      type: (type as any) || 'dialogue',
      level: level ? parseInt(level, 10) : undefined,
      readTimeMinutes: readTimeMinutes
        ? parseInt(readTimeMinutes, 10)
        : undefined,
      topic,
      requestId,
    });
  }
}
