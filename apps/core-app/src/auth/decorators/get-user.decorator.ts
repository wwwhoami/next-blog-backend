import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserNoPasswordEntity } from '@core/src/user/entities/user.entity';

export const GetUser = createParamDecorator(
  (data: string, context: ExecutionContext): UserNoPasswordEntity => {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    return data ? user?.[data] : user;
  },
);
