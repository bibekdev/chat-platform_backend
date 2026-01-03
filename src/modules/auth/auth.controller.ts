import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { User } from '@/infrastructure/database/types';
import { AuthService } from './auth.service';
import { AuthUser } from './decorators/auth-user.decorator';
import { IpAddress, UserAgent } from './decorators/metadata.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto, RefreshTokenDto, RegisterDto } from './dtos/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @UserAgent() userAgent: string,
    @IpAddress() ipAddress: string
  ) {
    return this.authService.login(loginDto, { userAgent, ipAddress });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @Body() refreshTokenDto: RefreshTokenDto,
    @UserAgent() userAgent: string,
    @IpAddress() ipAddress: string
  ) {
    return this.authService.refreshToken(refreshTokenDto.refreshToken, {
      userAgent,
      ipAddress,
    });
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() refreshTokenDto: RefreshTokenDto): Promise<{ message: string }> {
    await this.authService.logout(refreshTokenDto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  async logoutAll(@AuthUser('id') userId: string): Promise<{ message: string }> {
    await this.authService.logoutAll(userId);
    return { message: 'Logged out from all devices successfully' };
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  getMe(@AuthUser() user: User) {
    return user;
  }
}
