import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}

  @Post()
  async start(@Req() req: AuthenticatedRequest) {
    const convo = await this.service.startConversation(req.user.id);
    return { id: convo.id };
  }

  @Get(':id/messages')
  async list(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const messages = await this.service.listMessages(Number(id));
    return messages;
  }

  @Post(':id/messages')
  async send(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { hanzi: string },
  ) {
    const result = await this.service.sendUserMessage({
      conversationId: Number(id),
      userId: req.user.id,
      hanzi: (body.hanzi || '').trim(),
    });
    return result;
  }
}
