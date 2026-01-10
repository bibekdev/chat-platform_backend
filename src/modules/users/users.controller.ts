import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';

import { CursorPaginationQueryDto } from '@/common/lib/pagination';
import { AuthUser } from '@/modules/auth/decorators/auth-user.decorator';
import { AuthenticatedUser } from '@/modules/auth/types';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('suggestions')
  @HttpCode(HttpStatus.OK)
  async getUserSuggestions(
    @AuthUser() user: AuthenticatedUser,
    @Query() query: CursorPaginationQueryDto
  ) {
    return this.usersService.getUserSuggestions(user.id, query);
  }
}
