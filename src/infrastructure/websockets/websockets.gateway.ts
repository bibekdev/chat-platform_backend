import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

import { AuthenticatedSocket } from './types';

@WebSocketGateway()
export class WebsocketsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WebsocketsGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: AuthenticatedSocket, ...args: any[]) {
    // Already handled by adapter
  }

  handleDisconnect(client: AuthenticatedSocket) {
    // Already handled by adapter
  }
}
