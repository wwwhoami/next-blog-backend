import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';
import { Prisma } from 'prisma/generated/client';
import { throwError } from 'rxjs';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseRpcExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, _host: ArgumentsHost) {
    return throwError(
      () =>
        new RpcException({
          name: exception.name,
          code: exception.code,
          clientVersion: exception.clientVersion,
          message: exception.message,
        }),
    );
  }
}
