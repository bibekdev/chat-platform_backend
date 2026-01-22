import { INestApplicationContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, ServerOptions, Socket } from 'socket.io';

import { AuthService } from '@/modules/auth/auth.service';
import { JwtPayload } from '@/modules/auth/types';
import { AuthenticatedSocket } from './types';

export class WebsocketsAdapter extends IoAdapter {
  private readonly logger = new Logger(WebsocketsAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    private readonly app: INestApplicationContext,
    private readonly configService: ConfigService
  ) {
    super(app);
  }

  connectToRedis(): Promise<void> {
    return new Promise((resolve, reject) => {
      const redisHost = this.configService.getOrThrow<string>('REDIS_HOST');
      const redisPort = this.configService.getOrThrow<number>('REDIS_PORT');

      const redisOptions = {
        host: redisHost,
        port: redisPort,
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
      };

      const pubClient = new Redis(redisOptions);

      // Subscriber client needs enableReadyCheck disabled to avoid
      // INFO command being sent in subscriber mode
      const subClient = new Redis({
        ...redisOptions,
        enableReadyCheck: false,
      });

      let pubConnected = false;
      let subConnected = false;
      let hasError = false;

      const checkReady = () => {
        if (pubConnected && subConnected && !hasError) {
          this.adapterConstructor = createAdapter(pubClient, subClient);
          this.logger.log('WebSocket Redis adapter initialized');
          resolve();
        }
      };

      const handleError = (client: string) => (err: Error) => {
        if (!hasError) {
          hasError = true;
          this.logger.error(`Redis ${client} Client Error:`, err);
          reject(err);
        }
      };

      pubClient.on('error', handleError('Pub'));
      subClient.on('error', handleError('Sub'));

      pubClient.on('ready', () => {
        this.logger.log('Redis Pub Client Connected');
        pubConnected = true;
        checkReady();
      });

      subClient.on('ready', () => {
        this.logger.log('Redis Sub Client Connected');
        subConnected = true;
        checkReady();
      });
    });
  }

  createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    const allowedOrigins = this.configService
      .getOrThrow<string>('ALLOWED_ORIGINS')
      .split(',')
      .map(origin => origin.trim());

    const serverOptions: Partial<ServerOptions> = {
      ...options,
      cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingInterval: 25000,
      pingTimeout: 20000,
      transports: ['websocket', 'polling'],
    };

    const server: Server = super.createIOServer(port, serverOptions);

    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
      this.logger.log('Socket.IO Redis adapter attached');
    }

    const jwtService = this.app.get(JwtService);
    const authService = this.app.get(AuthService);
    const accessSecret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');

    server.use(async (socket: Socket, next) => {
      try {
        const token = this.extractToken(socket);

        if (!token) {
          this.logger.warn(
            `Connection rejected: No token provided from ${socket.handshake.address}`
          );
          return next(new Error('Authentication required'));
        }

        const payload: JwtPayload = await jwtService.verifyAsync(token, {
          secret: accessSecret,
        });

        if (payload.type !== 'access') {
          this.logger.warn(
            `Connection rejected: Invalid token type from ${socket.handshake.address}`
          );
          return next(new Error('Invalid token type'));
        }

        const user = await authService.validateUser(payload);

        if (!user) {
          this.logger.warn(`Connection rejected: User not found for ${payload.sub}`);
          return next(new Error('User not found'));
        }

        (socket as AuthenticatedSocket).user = user;

        this.logger.debug(`Socket authenticated for user: ${user.id}`);
        next();
      } catch (error) {
        this.logger.warn(
          `Connection rejected: Invalid token from ${socket.handshake.address}`,
          error instanceof Error ? error.message : 'Unknown error'
        );
        return next(new Error('Invalid or expired token'));
      }
    });

    return server;
  }

  private extractToken(socket: Socket): string | null {
    // Try to get token from auth header (preferred method)
    const authHeader = socket.handshake.headers.authorization;
    if (authHeader) {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) {
        return token;
      }
    }

    // Fallback to query parameter (useful for browser clients)
    const tokenFromQuery = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (typeof tokenFromQuery === 'string') {
      return tokenFromQuery;
    }

    return null;
  }
}
