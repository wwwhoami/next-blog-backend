import { UserNoPasswordEntity } from '@core/src/user/entities/user.entity';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetUser = createParamDecorator(
  (data: string, context: ExecutionContext): UserNoPasswordEntity => {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    return data ? user?.[data] : user;
  },
);
