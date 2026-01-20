import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';

import { CursorPaginationQueryDto } from '@/common/lib/pagination';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dtos/conversations.dto';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get('')
  @HttpCode(HttpStatus.OK)
  async getConversations(@AuthUser('id') userId: string, @Query() query: CursorPaginationQueryDto) {
    return this.conversationsService.findConversationsByUserId(userId, query);
  }

  @Post('')
  @HttpCode(HttpStatus.CREATED)
  async createConversation(
    @AuthUser('id') userId: string,
    @Body() createConversationDto: CreateConversationDto
  ) {
    return this.conversationsService.createConversation(userId, createConversationDto);
  }
}
