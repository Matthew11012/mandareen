import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Sse,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';
import { Observable } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@Controller('conversations')
export class ConversationsController {
  private readonly _service: ConversationsService;
  private readonly _jwtService: JwtService;

  constructor(service: ConversationsService, jwtService: JwtService) {
    this._service = service;
    this._jwtService = jwtService;
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async start(@Req() req: AuthenticatedRequest) {
    const convo = await this._service.startConversation(req.user.id);
    return { id: convo.id };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/messages')
  async list(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const messages = await this._service.listMessages(Number(id));
    return messages;
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/messages')
  async send(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { hanzi: string },
  ) {
    const result = await this._service.sendUserMessage({
      conversationId: Number(id),
      userId: req.user.id,
      hanzi: (body.hanzi || '').trim(),
    });
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/audio')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async sendAudio(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new Error('No audio file uploaded');
    }
    const result = await this._service.sendUserAudioMessage({
      conversationId: Number(id),
      userId: req.user.id,
      audioBuffer: file.buffer,
      mimeType: file.mimetype || 'audio/webm',
    });
    return result;
  }

  @Sse(':id/stream')
  stream(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Observable<{ data: string } | { event: string; data: any }> {
    // Verify token from query param for SSE (EventSource cannot send headers)
    const token = (req as any)?.query?.token as string | undefined;
    if (!token) {
      throw new Error('Unauthorized');
    }
    let userId: number | undefined;
    try {
      const payload = this._jwtService.verify(token, {
        secret: process.env.JWT_SECRET as string,
      }) as any;
      userId = Number(payload?.sub || payload?.id);
    } catch {
      throw new Error('Unauthorized');
    }
    if (!userId) throw new Error('Unauthorized');
    const hanzi = ((req as any)?.query?.hanzi as string | undefined) || '';
    return this._service.streamReply({
      conversationId: Number(id),
      userId,
      hanzi,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async listConversations(@Req() req: AuthenticatedRequest) {
    return this._service.listUserConversations(req.user.id);
  }
}
