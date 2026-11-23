export class PacoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PacoreError';
  }
}

export class InvalidSeriesError extends PacoreError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSeriesError';
  }
}
