import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { throwError } from 'rxjs';

@Catch(HttpException)
export class RpcValidationFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    return throwError(() => new RpcException(exception.getResponse()));
  }
}
