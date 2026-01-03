import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const UserAgent = createParamDecorator((_, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest();
  return request.headers['user-agent'];
});

export const IpAddress = createParamDecorator((_, ctx: ExecutionContext): string | undefined => {
  const request = ctx.switchToHttp().getRequest();
  return (
    request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    request.ip ||
    request.connection?.remoteAddress
  );
});
