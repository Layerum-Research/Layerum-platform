import {
  Logger,
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      exceptionResponse ??
      (exception instanceof Error
        ? exception.message
        : 'Internal server error');

    const stack =
      exception instanceof Error && exception.stack
        ? exception.stack
        : undefined;
    const details =
      exception instanceof HttpException
        ? exceptionResponse
        : exception instanceof Error
          ? { name: exception.name, message: exception.message }
          : { message: 'Unhandled non-error exception' };

    const logPayload = {
      method: request?.method,
      url: request?.originalUrl ?? request?.url,
      statusCode: status,
      message,
      details,
    };

    this.logger.error(
      JSON.stringify(logPayload),
      stack ?? JSON.stringify(details),
    );

    const body: Record<string, unknown> = {
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request?.originalUrl ?? request?.url,
      method: request?.method,
    };

    if (isDev) {
      body.details = details;
      body.stack = stack;
    }

    response.status(status).json(body);
  }
}
