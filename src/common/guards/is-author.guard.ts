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
import { EntityWithAuthorService } from '../entity-with-author.service';

@Injectable()
export class IsAuthorGuard implements CanActivate {
  constructor(protected readonly service: EntityWithAuthorService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    const {
      user,
      params,
    }: {
      user?: UserNoPasswordEntity;
      params: { id?: string };
    } = request;

    if (!user) return false;
    if (!params.id) throw new BadRequestException('Id param missing');

    const userId = user.id;
    const id = parseInt(params.id);

    if (isNaN(id)) throw new BadRequestException('Bad id param');

    try {
      // Determine if logged-in user is the same as the user that created the entity
      const { authorId } = await this.service.getAuthorId(id);
      return userId === authorId;
    } catch (error) {
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025') ||
        error.name === 'NotFoundError'
      ) {
        throw new NotFoundException(`Not found`);
      }
      if (error instanceof WrongParamsError)
        throw new BadRequestException(error.message);
    }

    return false;
  }
}
