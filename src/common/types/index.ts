export const CONVERSATION_EVENTS = {
  // Client -> Server
  JOIN_CONVERSATION: 'conversation:join',
  LEAVE_CONVERSATION: 'conversation:leave',
  SEND_MESSAGE: 'message:send',
  EDIT_MESSAGE: 'message:edit',
  DELETE_MESSAGE: 'message:delete',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  MARK_READ: 'message:read',
  ADD_REACTION: 'reaction:add',
  REMOVE_REACTION: 'reaction:remove',

  // Server -> Client
  NEW_MESSAGE: 'message:new',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',
  USER_TYPING: 'user:typing',
  MESSAGE_READ: 'message:read:update',
  MEMBER_JOINED: 'member:joined',
  MEMBER_LEFT: 'member:left',
  CONVERSATION_UPDATED: 'conversation:updated',
  ERROR: 'error',
} as const;
