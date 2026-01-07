import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';

import { User } from '@/infrastructure/database/types';
import { SessionCacheService } from '@/infrastructure/redis/session-cache.service';
import { CachedUserSession } from '@/infrastructure/redis/types';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './dtos/auth.dto';
import { TokenService } from './token.service';
import { AuthenticatedUser, JwtPayload, RefreshTokenPayload, TokenPair } from './types';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    private readonly jwtservice: JwtService,
    private readonly sessionCacheService: SessionCacheService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService
  ) {}

  async register(dto: RegisterDto): Promise<Omit<User, 'password'>> {
    const { email, password, name } = dto;

    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.hashPassword(password);

    const user = await this.usersService.createUser({
      email,
      password: passwordHash,
      name,
    });

    return this.usersService.sanitizeUser(user);
  }

  async login(dto: LoginDto, metadata: { userAgent?: string; ipAddress?: string }) {
    const { email, password } = dto;

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('Invalid credentials');
    }

    const isPasswordValid = await this.verifyPassword(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.usersService.updateUser(user.id, { lastLoggedInAt: new Date() });

    await this.cacheUserSession(user);

    const tokens = await this.generateTokenPair(user, metadata);

    return {
      user: this.usersService.sanitizeUser(user),
      tokens: this.formatTokenResponse(tokens),
    };
  }

  async refreshToken(refreshToken: string, metadata?: { userAgent?: string; ipAddress?: string }) {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtservice.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const storedToken = await this.tokenService.findByToken(refreshToken);

    if (!storedToken) {
      // Token not found or already revoked - possible token reuse attack
      // Revoke all tokens in this family as a security measure
      this.logger.warn(
        `Possible token reuse detected for family: ${payload.family}. Revoking all family tokens.`
      );

      await this.tokenService.revokeTokenFamily(payload.family);
      throw new UnauthorizedException('Token has been revoked. Please login again.');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Revoke the old refresh token (rotation)
    await this.tokenService.revokeToken(storedToken.id);

    // Generate new token pair with the same family
    const tokens = await this.generateTokenPair(user, metadata, payload.family);

    this.logger.log(`Successfully refreshed token for user: ${user.id}`);

    return this.formatTokenResponse(tokens);
  }

  async logout(refreshToken: string): Promise<void> {
    const storedToken = await this.tokenService.findByToken(refreshToken);
    if (storedToken) {
      await this.tokenService.revokeToken(storedToken.id);
      this.logger.log(`User logged out, token revoked: ${storedToken.id}`);
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.tokenService.revokeAllUserTokens(userId);
    this.logger.log(`All tokens revoked for user: ${userId}`);
  }

  async validateUser(payload: JwtPayload): Promise<AuthenticatedUser | null> {
    if (payload.type !== 'access') {
      return null;
    }

    // Check cache first
    const cachedSession = await this.sessionCacheService.getUserSession(payload.sub);
    if (cachedSession) {
      this.logger.debug(`User session cache hit for: ${payload.sub}`);
      return {
        id: cachedSession.id,
        email: cachedSession.email,
        name: cachedSession.name,
        avatar: cachedSession.avatar,
      };
    }

    // Cache miss - fetch from database
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      return null;
    }

    // Cache for future requests
    await this.cacheUserSession(user);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar ?? undefined,
    };
  }

  private async cacheUserSession(user: User): Promise<void> {
    const sessionData: CachedUserSession = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar ?? undefined,
      cachedAt: Date.now(),
    };
    await this.sessionCacheService.cacheUserSession(user.id, sessionData);
  }

  private async generateTokenPair(
    user: User,
    metadata?: { userAgent?: string; ipAddress?: string },
    existingFamily?: string
  ): Promise<TokenPair> {
    const family = existingFamily ?? this.tokenService.generateFamily();

    const accessTokenPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: 'access',
    };

    const accessToken = await this.jwtservice.signAsync(accessTokenPayload, {
      secret: this.configService.get('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshTokenPayload: RefreshTokenPayload = {
      sub: user.id,
      email: user.email,
      type: 'refresh',
      family,
      tokenId: this.tokenService.generateSecureToken(),
    };

    const refreshTokenExpiresIn = this.configService.get('JWT_REFRESH_EXPIRES_IN');

    const refreshToken = await this.jwtservice.signAsync(refreshTokenPayload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: refreshTokenExpiresIn,
    });

    const expiresAt = this.calculateExpirationDate(refreshTokenExpiresIn);

    await this.tokenService.createRefreshToken({
      userId: user.id,
      token: refreshToken,
      family,
      expiresAt,
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    });

    const expiresIn = this.parseExpiresIn(
      this.configService.get('JWT_ACCESS_EXPIRES_IN') as string
    );

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  private async hashPassword(password: string): Promise<string> {
    return hash(password, this.BCRYPT_ROUNDS);
  }

  private async verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    return compare(password, passwordHash);
  }

  private formatTokenResponse(tokens: TokenPair) {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer',
    };
  }

  private calculateExpirationDate(expiresIn: string): Date {
    const seconds = this.parseExpiresIn(expiresIn);
    return new Date(Date.now() + seconds * 1000);
  }

  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 900; // Default 15 minutes
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900;
    }
  }
}
