export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = new.target.name;
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Not authenticated") {
    super(401, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Not permitted") {
    super(403, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found") {
    super(404, message);
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}
