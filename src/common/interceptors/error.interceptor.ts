import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { catchError, Observable, throwError } from 'rxjs';
import { WrongParamsError } from '../errors/wrong-params.error';

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    context.getArgs;
    return next.handle().pipe(
      catchError((error) => {
        if (
          (error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2025') ||
          error.name === 'NotFoundError'
        )
          return throwError(() => new NotFoundException(error.message));

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          return throwError(() => new ConflictException());

        if (error instanceof WrongParamsError)
          return throwError(() => new BadRequestException(error.message));

        return throwError(() => error);
      }),
    );
  }
}
