/* ============================================================
   ReQuora — HTTP helpers
   Every response uses the same envelope:

     success: { success: true,  data: {...}, message: "..." }
     error:   { success: false, error: "CODE", message: "...", fields?: {...} }
   ============================================================ */

class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const Errors = {
  validation: (message, fields) => new ApiError(400, 'VALIDATION_ERROR', message || 'Please check the highlighted fields.', fields),
  unauthorized: (message, code) => new ApiError(401, code || 'UNAUTHORIZED', message || 'Please log in to continue.'),
  forbidden: (message) => new ApiError(403, 'FORBIDDEN', message || 'You do not have permission to do that.'),
  notFound: (message) => new ApiError(404, 'NOT_FOUND', message || 'That record could not be found.'),
  conflict: (message, extra) => {
    const err = new ApiError(409, 'CONFLICT', message || 'That action conflicts with the current state.');
    if (extra) err.extra = extra;
    return err;
  },
  tooMany: (message) => new ApiError(429, 'RATE_LIMITED', message || 'Too many requests. Please try again later.'),
};

function ok(res, data = {}, message, status = 200) {
  const body = { success: true, data };
  if (message) body.message = message;
  return res.status(status).json(body);
}

function fail(res, status, code, message, fields) {
  const body = { success: false, error: code, message };
  if (fields && Object.keys(fields).length) body.fields = fields;
  return res.status(status).json(body);
}

// Wraps an async route handler so a thrown error reaches errorHandler
// instead of becoming an unhandled promise rejection.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch(next);
  };
}

function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api/')) {
    return fail(res, 404, 'NOT_FOUND', 'That API endpoint does not exist.');
  }
  return next();
}

// Final error handler. Never leaks stack traces or internals to the client.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ApiError) {
    const body = { success: false, error: err.code, message: err.message };
    if (err.fields && Object.keys(err.fields).length) body.fields = err.fields;
    if (err.extra) Object.assign(body, err.extra);
    return res.status(err.status).json(body);
  }

  // multer upload problems
  if (err && err.name === 'MulterError') {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'That image is too large. Please upload a photo of 5 MB or less.'
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Unexpected file field. Upload a single photo in the "image" field.'
          : 'The photo could not be uploaded.';
    return fail(res, 400, 'UPLOAD_ERROR', message);
  }
  if (err && err.code === 'INVALID_FILE_TYPE') {
    return fail(res, 400, 'UPLOAD_ERROR', err.message);
  }

  // body-parser: malformed JSON / body too large
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return fail(res, 400, 'MALFORMED_REQUEST', 'The request body is not valid JSON.');
  }
  if (err && err.type === 'entity.too.large') {
    return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
  }

  console.error('[ReQuora] Unexpected error:', err);
  return fail(res, 500, 'SERVER_ERROR', 'Something went wrong on our side. Please try again.');
}

module.exports = { ApiError, Errors, ok, fail, asyncHandler, notFoundHandler, errorHandler };
