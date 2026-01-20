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
  ConversationIdParamDto,
  ConversationWithMemberIdParamDto,
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

  @Get(':conversationId')
  @HttpCode(HttpStatus.OK)
  async getConversation(@AuthUser('id') userId: string, @Param() params: ConversationIdParamDto) {
    return this.conversationsService.getConversationWithMembers(params.conversationId, userId);
  }

  @Get(':conversationId/details')
  @HttpCode(HttpStatus.OK)
  async getConversationDetails(
    @AuthUser('id') userId: string,
    @Param() params: ConversationIdParamDto
  ) {
    return this.conversationsService.getConversationWithDetails(params.conversationId, userId);
  }

  @Put(':conversationId')
  @HttpCode(HttpStatus.OK)
  async updateConversation(
    @AuthUser('id') userId: string,
    @Param() params: ConversationIdParamDto,
    @Body() updateConversationDto: UpdateConversationDto
  ) {
    return this.conversationsService.updateConversation(
      params.conversationId,
      userId,
      updateConversationDto
    );
  }

  @Delete(':conversationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConversation(
    @AuthUser('id') userId: string,
    @Param() params: ConversationIdParamDto
  ) {
    return this.conversationsService.deleteConversation(params.conversationId, userId);
  }

  @Get(':conversationId/members')
  @HttpCode(HttpStatus.OK)
  async getConversationMembers(@Param() params: ConversationIdParamDto) {
    return this.conversationsService.getConversationMembers(params.conversationId);
  }

  @Post(':conversationId/members')
  @HttpCode(HttpStatus.CREATED)
  async addMembers(
    @AuthUser('id') userId: string,
    @Param() params: ConversationIdParamDto,
    @Body() addMembersDto: AddMembersDto
  ) {
    return this.conversationsService.addMembers(params.conversationId, userId, addMembersDto);
  }

  @Delete(':conversationId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @AuthUser('id') userId: string,
    @Param() params: ConversationWithMemberIdParamDto
  ) {
    return this.conversationsService.removeMember(params.conversationId, userId, params.memberId);
  }

  @Post(':conversationId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leaveConversation(@AuthUser('id') userId: string, @Param() params: ConversationIdParamDto) {
    return this.conversationsService.leaveConversation(params.conversationId, userId);
  }

  @Patch(':conversationId/members/:memberId/role')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateMemberRole(
    @AuthUser('id') userId: string,
    @Param() params: ConversationWithMemberIdParamDto,
    @Body() updateMemberRoleDto: UpdateMemberRoleDto
  ) {
    return this.conversationsService.updateMemberRole(
      params.conversationId,
      userId,
      params.memberId,
      updateMemberRoleDto
    );
  }
}
