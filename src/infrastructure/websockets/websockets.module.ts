import { Global, Module } from '@nestjs/common';

import { WebsocketsGateway } from './websockets.gateway';
import { WebsocketsService } from './websockets.service';

@Global()
@Module({
  providers: [WebsocketsService, WebsocketsGateway],
  exports: [WebsocketsService, WebsocketsGateway],
})
export class WebsocketsModule {}
