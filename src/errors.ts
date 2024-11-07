export const ErrorCodes = {
  INVALID_MESSAGE: "INVALID_MESSAGE",
  TRANSCRIPTION_FAILED: "TRANSCRIPTION_FAILED",
  LLM_FAILED: "LLM_FAILED",
  DATABASE_ERROR: "DATABASE_ERROR",
} as const;

export class AppError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, 401);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class InterviewError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "InterviewError";
  }
}
