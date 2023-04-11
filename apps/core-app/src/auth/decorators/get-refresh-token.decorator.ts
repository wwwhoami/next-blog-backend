import { JwtPayload } from '@app/auth/types/jwt-payload.type';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetRefreshToken = createParamDecorator(
  (data: string, context: ExecutionContext): JwtPayload => {
    const req = context.switchToHttp().getRequest();
    const jwt = req.user;

    return data ? jwt?.[data] : jwt;
  },
);
