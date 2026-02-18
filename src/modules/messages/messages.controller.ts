import { Controller, Get, Param, Query } from '@nestjs/common';

import { CursorPaginationQueryDto } from '@/common/lib/pagination';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { ConversationIdParamDto } from '../conversations/dtos/conversations.dto';
import { MessagesService } from './messages.service';

@Controller('conversations/:conversationId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  getConversationMessages(
    @Param() params: ConversationIdParamDto,
    @Query() query: CursorPaginationQueryDto,
    @AuthUser('id') userId: string
  ) {
    return this.messagesService.getConversationMessages(params.conversationId, userId, query);
  }
}
