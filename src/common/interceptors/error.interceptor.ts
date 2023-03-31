import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { catchError, Observable, throwError } from 'rxjs';
import { ConflictError } from '../errors/conflict.error';
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

        return throwError(() => error);
      }),
    );
  }
}
