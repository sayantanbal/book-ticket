export class HttpError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = options.code;
    this.details = options.details;
    this.expose = options.expose ?? statusCode < 500;
  }
}
