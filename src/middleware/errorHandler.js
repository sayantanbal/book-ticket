import { HttpError } from "../errors/HttpError.js";

function mapDatabaseError(error) {
  if (!error?.code) {
    return null;
  }

  if (error.code === "23505") {
    return new HttpError(409, "Resource already exists", {
      code: "CONFLICT",
    });
  }

  if (error.code === "23503") {
    return new HttpError(409, "Related resource does not exist", {
      code: "FOREIGN_KEY_VIOLATION",
    });
  }

  if (error.code === "22P02") {
    return new HttpError(400, "Invalid input", {
      code: "INVALID_INPUT",
    });
  }

  return null;
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  const mappedDatabaseError = mapDatabaseError(error);
  const normalizedError = mappedDatabaseError || error;

  let statusCode = 500;
  let message = "Internal server error";
  let code;
  let details;

  if (normalizedError instanceof HttpError) {
    statusCode = normalizedError.statusCode;
    message = normalizedError.expose
      ? normalizedError.message
      : "Internal server error";
    code = normalizedError.code;
    details = normalizedError.details;
  } else if (normalizedError?.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Token is invalid";
    code = "INVALID_TOKEN";
  } else if (normalizedError?.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token has expired";
    code = "TOKEN_EXPIRED";
  }

  if (statusCode >= 500) {
    console.error("Unhandled request error", normalizedError);
  }

  res.status(statusCode).json({
    error: message,
    code,
    details,
  });
}
