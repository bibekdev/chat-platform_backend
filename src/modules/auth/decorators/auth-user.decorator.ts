import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthenticatedRequest, AuthenticatedUser } from '../types';

export const AuthUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return data ? request.user?.[data] : request.user;
  }
);
