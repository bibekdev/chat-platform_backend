import { Controller, Get, Param, Query } from '@nestjs/common';

import { MessagesService } from './messages.service';

@Controller('conversations/:conversationId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}
}
