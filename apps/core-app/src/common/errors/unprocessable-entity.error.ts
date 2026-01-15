export class UnprocessableEntityError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'UnprocessableEntityError';
  }
}
