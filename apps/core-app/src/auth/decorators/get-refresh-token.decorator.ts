import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../types/jwt-payload.type';

export const GetRefreshToken = createParamDecorator(
  (data: string, context: ExecutionContext): JwtPayload => {
    const req = context.switchToHttp().getRequest();
    const jwt = req.user;

    return data ? jwt?.[data] : jwt;
  },
);
