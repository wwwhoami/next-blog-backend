import { Role } from '@core/src/user/entities/role.enum';
import { UserNoPasswordEntity } from '@core/src/user/entities/user.entity';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntityWithAuthorService } from '../entity-with-author.service';
import { IsAuthorGuard } from './is-author.guard';

@Injectable()
export class IsAdminOrAuthorGuard extends IsAuthorGuard implements CanActivate {
  constructor(
    protected readonly reflector: Reflector,
    protected readonly service: EntityWithAuthorService,
  ) {
    super(reflector, service);
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
