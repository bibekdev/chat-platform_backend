import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { CursorPaginationQueryDto } from '@/common/lib/pagination';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { ConversationsService } from './conversations.service';
import {
  AddMembersDto,
  CreateConversationDto,
  UpdateConversationDto,
  UpdateMemberRoleDto,
} from './dtos/conversations.dto';

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

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getConversation(@AuthUser('id') userId: string, @Param('id') conversationId: string) {
    return this.conversationsService.getConversationWithMembers(conversationId, userId);
  }

  @Get(':id/details')
  @HttpCode(HttpStatus.OK)
  async getConversationDetails(
    @AuthUser('id') userId: string,
    @Param('id') conversationId: string
  ) {
    return this.conversationsService.getConversationWithDetails(conversationId, userId);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async updateConversation(
    @AuthUser('id') userId: string,
    @Param('id') conversationId: string,
    @Body() updateConversationDto: UpdateConversationDto
  ) {
    return this.conversationsService.updateConversation(
      conversationId,
      userId,
      updateConversationDto
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConversation(@AuthUser('id') userId: string, @Param('id') conversationId: string) {
    return this.conversationsService.deleteConversation(conversationId, userId);
  }

  @Get(':id/members')
  @HttpCode(HttpStatus.OK)
  async getConversationMembers(@Param('id') conversationId: string) {
    return this.conversationsService.getConversationMembers(conversationId);
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  async addMembers(
    @AuthUser('id') userId: string,
    @Param('id') conversationId: string,
    @Body() addMembersDto: AddMembersDto
  ) {
    return this.conversationsService.addMembers(conversationId, userId, addMembersDto);
  }

  @Delete(':id/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @AuthUser('id') userId: string,
    @Param('id') conversationId: string,
    @Param('memberId') memberId: string
  ) {
    return this.conversationsService.removeMember(conversationId, userId, memberId);
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leaveConversation(@AuthUser('id') userId: string, @Param('id') conversationId: string) {
    return this.conversationsService.leaveConversation(conversationId, userId);
  }

  @Patch(':id/members/:memberId/role')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateMemberRole(
    @AuthUser('id') userId: string,
    @Param('id') conversationId: string,
    @Param('memberId') memberId: string,
    @Body() updateMemberRoleDto: UpdateMemberRoleDto
  ) {
    return this.conversationsService.updateMemberRole(
      conversationId,
      userId,
      memberId,
      updateMemberRoleDto
    );
  }

  @Post(':id/read/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAsRead(
    @AuthUser('id') userId: string,
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string
  ) {
    return this.conversationsService.markAsRead(conversationId, userId, messageId);
  }
}
