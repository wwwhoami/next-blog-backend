export class UploadError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'UPLOAD_ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'UploadError';
    Error.captureStackTrace(this, this.constructor);
  }
}
