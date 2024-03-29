import { ForbiddenError } from '@app/shared/errors/forbidden.error';
import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable, catchError, throwError } from 'rxjs';
import { ConflictError } from '../errors/conflict.error';
import { UnauthorizedError } from '../errors/unauthorized.error';
import { UnprocesasbleEntityError } from '../errors/unprocessable-entity.errror';
import { WrongParamsError } from '../errors/wrong-params.error';

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    context.getArgs;
    return next.handle().pipe(
      catchError((error) => {
        // Records required but not found
        if (
          (error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2025') ||
          error.name === 'NotFoundError'
        )
          return throwError(() => new NotFoundException());

        // Unique constraint violation
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          return throwError(() => new ConflictException());

        // Foreign key constraint violation
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2003'
        )
          return throwError(() => new UnprocessableEntityException());

        if (error instanceof ConflictError)
          return throwError(() => new ConflictException(error.message));

        if (error instanceof WrongParamsError)
          return throwError(() => new BadRequestException(error.message));

        if (error instanceof UnprocesasbleEntityError) {
          return throwError(
            () => new UnprocessableEntityException(error.message),
          );
        }

        if (
          error instanceof UnauthorizedError ||
          error.name === 'UnauthorizedError'
        ) {
          return throwError(() => new UnauthorizedException(error.message));
        }

        if (
          error instanceof ForbiddenError ||
          error.name === 'ForbiddenError'
        ) {
          return throwError(() => new ForbiddenException(error.message));
        }

        return throwError(() => error);
      }),
    );
  }
}
