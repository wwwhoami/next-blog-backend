import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { WrongParamsError } from 'src/common/errors/wrong-params.error';
import { UserNoPasswordEntity } from 'src/user/entities/user.entity';
import { PostService } from '../post.service';

@Injectable()
export class IsAuthorGuard implements CanActivate {
  constructor(protected readonly postService: PostService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    const {
      user,
      params,
    }: {
      user?: UserNoPasswordEntity;
      params: { postId?: string };
    } = request;

    if (!user) return false;
    if (!params.postId) throw new BadRequestException('Post id param missing');

    const userId = user.id;
    const postId = parseInt(params.postId);

    if (isNaN(postId)) throw new BadRequestException('Bad post id param');

    try {
      // Determine if logged-in user is the same as the user that created the feed post
      const { authorId } = await this.postService.getAuthorId(postId);
      return userId === authorId;
    } catch (error) {
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025') ||
        error.name === 'NotFoundError'
      ) {
        throw new NotFoundException(`Post not found`);
      }
      if (error instanceof WrongParamsError)
        throw new BadRequestException(error.message);
    }

    return false;
  }
}
