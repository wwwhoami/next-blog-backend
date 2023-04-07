export class UnauthorizedError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
