import { Role } from '@core/src/user/entities/role.enum';
import { UserNoPasswordEntity } from '@core/src/user/entities/user.entity';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class IsAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const {
      user,
    }: {
      user: UserNoPasswordEntity;
    } = request;

    return user.role === Role.Admin;
  }
}
