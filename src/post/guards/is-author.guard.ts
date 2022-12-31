import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WrongParamsError } from 'src/common/errors/wrong-params.error';
import { UserNoPasswordEntity } from 'src/user/entities/user.entity';
import { PostService } from '../post.service';

@Injectable()
export class IsAuthorGuard implements CanActivate {
  constructor(private postService: PostService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const {
      user,
      body,
    }: {
      user: UserNoPasswordEntity;
      body: { id: number | undefined; slug: string | undefined };
    } = request;

    if (!user) return false;
    if (!body) throw new BadRequestException();

    const userId = user.id;
    const { id, slug } = body;

    try {
      // Determine if logged-in user is the same as the user that created the feed post
      const { authorId } = await this.postService.getAuthorId({ id, slug });
      return userId === authorId;
    } catch (error) {
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025') ||
        error.name === 'NotFoundError'
      ) {
        if (id) throw new NotFoundException(`Post with id ${id} not found`);
        if (slug)
          throw new NotFoundException(`Post with slug ${slug} not found`);
      }
      if (error instanceof WrongParamsError)
        throw new BadRequestException(
          'Neither id nor slug provided in request body',
        );
    }

    return false;
  }
}
