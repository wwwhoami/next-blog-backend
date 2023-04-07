export class ConflictError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'ConflictError';
  }
}
