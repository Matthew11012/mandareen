import { Controller, Query, Req, Sse } from '@nestjs/common';
import { LessonsService } from './lessons.service';

@Controller('lessons')
export class LessonsStreamController {
  constructor(private readonly lessonsService: LessonsService) {}

  // Public SSE endpoint; token is validated inside LessonsService
  @Sse('generate/stream')
  streamGenerate(
    @Req() _req: any,
    @Query('token') token?: string,
    @Query('type') type?: 'story' | 'dialogue',
    @Query('level') level?: string,
    @Query('readTimeMinutes') readTimeMinutes?: string,
    @Query('topic') topic?: string,
    @Query('requestId') requestId?: string,
  ) {
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
