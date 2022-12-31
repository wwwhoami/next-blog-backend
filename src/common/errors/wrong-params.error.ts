export class WrongParamsError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'WrongParamsError';
  }
}
