import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Role } from 'src/user/entities/role.enum';
import { UserNoPasswordEntity } from 'src/user/entities/user.entity';
import { EntityWithAuthorService } from '../entity-with-author.service';
import { IsAuthorGuard } from './is-author.guard';

@Injectable()
export class IsAdminOrAuthorGuard extends IsAuthorGuard implements CanActivate {
  constructor(protected readonly service: EntityWithAuthorService) {
    super(service);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const {
      user,
    }: {
      user: UserNoPasswordEntity;
    } = request;

    const isAdmin = user.role === Role.Admin;

    return isAdmin || (await super.canActivate(context));
  }
}
