import { Injectable, Logger } from '@nestjs/common';

import { generateUniqueId } from '@/common/lib/utils';
import { RedisService } from '@/infrastructure/redis/redis.service';
import { ActiveCall, CallMediaType } from '@/infrastructure/websockets/types';

const CALL_TTL = 60 * 60; // 1 hour max call duration
const CALL_KEY_PREFIX = 'call:';
const CONV_CALL_KEY_PREFIX = 'conv_call:';
const USER_CALL_KEY_PREFIX = 'user_call:';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(private readonly redis: RedisService) {}

  async createCall({
    conversationId,
    initiatorId,
    isGroup,
    mediaType = 'audio',
  }: {
    conversationId: string;
    initiatorId: string;
    isGroup: boolean;
    mediaType: CallMediaType;
  }) {
    // Clean up any stale call this user is still associated with
    await this.removeUserFromAllCalls(initiatorId);

    const existing = await this.getCallByConversation(conversationId);
    if (existing) {
      // Only the initiator left (their own stale call) - force clean it
      const onlySelf =
        existing.participants.length === 0 ||
        (existing.participants.length === 1 && existing.participants[0] === initiatorId);

      if (onlySelf) {
        this.logger.warn(
          `Cleaning up stale call ${existing.id} for conversation ${conversationId}`
        );
        await this.endCall(existing.id);
      } else {
        throw new Error('A call is already active in this conversation');
      }
    }

    const call: ActiveCall = {
      id: generateUniqueId('call'),
      conversationId,
      initiatorId,
      participants: [initiatorId],
      startedAt: new Date().toISOString(),
      isGroup,
      mediaType,
    };

    await this.redis.setJson(`${CALL_KEY_PREFIX}${call.id}`, call, CALL_TTL);
    await this.redis.set(`${CONV_CALL_KEY_PREFIX}${conversationId}`, call.id, CALL_TTL);
    await this.redis.set(`${USER_CALL_KEY_PREFIX}${initiatorId}`, call.id, CALL_TTL);

    return call;
  }

  async getCall(callId: string): Promise<ActiveCall | null> {
    return this.redis.getJson<ActiveCall>(`${CALL_KEY_PREFIX}${callId}`);
  }

  async getCallByConversation(conversationId: string): Promise<ActiveCall | null> {
    const callId = await this.redis.get(`${CONV_CALL_KEY_PREFIX}${conversationId}`);
    if (!callId) return null;

    const call = await this.getCall(callId);
    if (!call) {
      await this.redis.del(`${CONV_CALL_KEY_PREFIX}${conversationId}`);
      return null;
    }
    return call;
  }

  async getUserActiveCallId(userId: string): Promise<string | null> {
    return this.redis.get(`${USER_CALL_KEY_PREFIX}${userId}`);
  }

  async joinCall(callId: string, userId: string): Promise<ActiveCall | null> {
    const call = await this.getCall(callId);
    if (!call) return null;

    if (call.participants.includes(userId)) return call;

    call.participants.push(userId);
    await this.redis.setJson(`${CALL_KEY_PREFIX}${callId}`, call, CALL_TTL);
    await this.redis.set(`${USER_CALL_KEY_PREFIX}${userId}`, callId, CALL_TTL);

    return call;
  }

  async leaveCall(callId: string, userId: string): Promise<ActiveCall | null> {
    const call = await this.getCall(callId);
    if (!call) return null;

    call.participants = call.participants.filter(id => id !== userId);
    await this.redis.del(`${USER_CALL_KEY_PREFIX}${userId}`);

    if (call.participants.length === 0) {
      await this.endCall(callId);
      return null;
    }

    await this.redis.setJson(`${CALL_KEY_PREFIX}${callId}`, call, CALL_TTL);
    return call;
  }

  async endCall(callId: string): Promise<ActiveCall | null> {
    const call = await this.getCall(callId);
    if (!call) return null;

    for (const userId of call.participants) {
      await this.redis.del(`${USER_CALL_KEY_PREFIX}${userId}`);
    }
    await this.redis.del(`${CALL_KEY_PREFIX}${callId}`);
    await this.redis.del(`${CONV_CALL_KEY_PREFIX}${call.conversationId}`);

    this.logger.log(`Call ${callId} ended`);
    return call;
  }

  async removeUserFromAllCalls(
    userId: string
  ): Promise<{ callId: string; remaining: ActiveCall | null } | null> {
    const callId = await this.getUserActiveCallId(userId);
    if (!callId) return null;

    const remaining = await this.leaveCall(callId, userId);
    return { callId, remaining };
  }
}
