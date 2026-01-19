type StorageConnectionErrorDetails = {
  region?: string;
  endpoint?: string;
  bucket?: string;
};

export class StorageConnectionError extends Error {
  public readonly code: string = 'STORAGE_CONNECTION_ERROR';

  constructor(
    message: string,
    public readonly details?: StorageConnectionErrorDetails,
  ) {
    super(message);
    this.name = 'StorageConnectionError';
    Error.captureStackTrace(this, this.constructor);
  }
}
