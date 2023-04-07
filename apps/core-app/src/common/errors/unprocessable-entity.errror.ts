export class UnprocesasbleEntityError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'UnprocesasbleEntityError';
  }
}
