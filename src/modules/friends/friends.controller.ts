import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { User } from '@/infrastructure/database/types';
import { AuthUser } from '@/modules/auth/decorators/auth-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import {
  CursorPaginationQueryDto,
  FriendIdParamDto,
  FriendRequestIdParamDto,
  SendFriendRequestDto,
} from './dtos/friends.dto';
import { FriendsService } from './friends.service';

@Controller('friends')
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  // ==================== FRIENDS ====================

  @Get()
  @HttpCode(HttpStatus.OK)
  async getFriends(@AuthUser() user: AuthenticatedUser, @Query() query: CursorPaginationQueryDto) {
    return this.friendsService.getFriends(user.id, query);
  }

  @Delete(':friendId')
  @HttpCode(HttpStatus.OK)
  async removeFriend(@AuthUser() user: AuthenticatedUser, @Param() params: FriendIdParamDto) {
    return this.friendsService.removeFriend(user.id, params.friendId);
  }

  // ==================== FRIEND REQUESTS ====================

  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  async sendFriendRequest(@AuthUser() user: AuthenticatedUser, @Body() dto: SendFriendRequestDto) {
    return this.friendsService.sendFriendRequest(user.id, dto.receiverId);
  }

  @Get('requests/incoming')
  @HttpCode(HttpStatus.OK)
  async getIncomingFriendRequests(
    @AuthUser() user: AuthenticatedUser,
    @Query() query: CursorPaginationQueryDto
  ) {
    return this.friendsService.getIncomingFriendRequests(user.id, query);
  }

  @Get('requests/outgoing')
  @HttpCode(HttpStatus.OK)
  async getOutgoingFriendRequests(
    @AuthUser() user: AuthenticatedUser,
    @Query() query: CursorPaginationQueryDto
  ) {
    return this.friendsService.getOutgoingFriendRequests(user.id, query);
  }

  @Post('requests/:requestId/accept')
  @HttpCode(HttpStatus.OK)
  async acceptFriendRequest(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: FriendRequestIdParamDto
  ) {
    await this.friendsService.acceptFriendRequest(params.requestId, user.id);
    return { message: 'Friend request accepted' };
  }

  @Post('requests/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  async rejectFriendRequest(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: FriendRequestIdParamDto
  ) {
    await this.friendsService.rejectFriendRequest(params.requestId, user.id);
    return { message: 'Friend request rejected' };
  }

  @Delete('requests/:requestId')
  @HttpCode(HttpStatus.OK)
  async cancelFriendRequest(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: FriendRequestIdParamDto
  ) {
    await this.friendsService.cancelFriendRequest(params.requestId, user.id);
    return { message: 'Friend request cancelled' };
  }
}
