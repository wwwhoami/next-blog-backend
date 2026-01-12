import { WrongParamsError } from '@core/src/common/errors/wrong-params.error';
import { UserNoPasswordEntity } from '@core/src/user/entities/user.entity';
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { Prisma } from 'prisma/generated/client';
import { ID_TYPE_KEY } from '../decorators/id-type.decorator';
import { EntityWithAuthorService } from '../entity-with-author.service';

@Injectable()
export class IsAuthorGuard implements CanActivate {
  constructor(
    protected readonly reflector: Reflector,
    protected readonly service: EntityWithAuthorService,
  ) {}

  /**
   * @description Validates that the provided id is a valid integer.
   */
  private validateIntId(id: string): number | string {
    const parsedId = parseInt(id);
    if (isNaN(parsedId)) throw new BadRequestException('Bad id param');

    return parsedId;
  }

  /**
   * @description Validates that the provided id is a valid UUID.
   */
  private validateUuidId(id: string): string {
    if (!isUUID(id)) throw new BadRequestException('Invalid UUID param');
    return id;
  }

  /**
   * @param id The id to validate.
   * @param idType The type of the id ('int' or 'uuid').
   * @description Validates the provided id based on its type.
   */
  protected validateId(id: string, idType: 'int' | 'uuid'): number | string {
    switch (idType) {
      case 'int':
        return this.validateIntId(id);
      case 'uuid':
        return this.validateUuidId(id);
      default:
        throw new BadRequestException('Invalid id type');
    }
  }

  /**
   * @returns The ID type metadata for the current handler ('int' by default).
   * @description Uses the reflector ID_TYPE_KEY to determine the ID type.
   */
  protected getIdType(context: ExecutionContext): 'int' | 'uuid' {
    return (
      this.reflector.get<'int' | 'uuid'>(ID_TYPE_KEY, context.getHandler()) ??
      'int'
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
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
    const idType = this.getIdType(context);
    const id = this.validateId(params.id, idType);

    try {
      // Determine if logged-in user is the same as the user that created the entity
      const { authorId } = await this.service.getAuthorId(id);
      return authorId !== null && userId === authorId;
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
