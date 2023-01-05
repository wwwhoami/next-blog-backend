import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Role } from 'src/user/entities/role.enum';
import { UserNoPasswordEntity } from 'src/user/entities/user.entity';

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
