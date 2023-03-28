export class NotFoundError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'NotFoundError';
  }
}
