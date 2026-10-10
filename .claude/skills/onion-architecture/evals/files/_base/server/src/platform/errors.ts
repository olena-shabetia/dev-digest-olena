export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super('not_found', `${what} not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('conflict', message, 409);
  }
}
