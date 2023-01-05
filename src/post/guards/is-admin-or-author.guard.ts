import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Role } from 'src/user/entities/role.enum';
import { UserNoPasswordEntity } from 'src/user/entities/user.entity';
import { PostService } from '../post.service';
import { IsAuthorGuard } from './is-author.guard';

@Injectable()
export class IsAdminOrAuthorGuard extends IsAuthorGuard implements CanActivate {
  constructor(protected readonly postService: PostService) {
    super(postService);
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
