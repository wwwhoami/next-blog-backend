export class ProcessingError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'PROCESSING_ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ProcessingError';
    Error.captureStackTrace(this, this.constructor);
  }
}
