// Standardized API response helpers

export function success(data: unknown, status = 200) {
  return Response.json({ success: true, data }, { status });
}

export function created(data: unknown) {
  return Response.json({ success: true, data }, { status: 201 });
}

export function noContent() {
  return new Response(null, { status: 204 });
}

export function error(message: string, status = 400, code?: string) {
  return Response.json({ success: false, error: message, code }, { status });
}

export function unauthorized(message = 'Not authenticated') {
  return error(message, 401, 'AUTH_010');
}

export function notFound(message = 'Not found') {
  return error(message, 404, 'NOT_FOUND');
}

export function serverError(message = 'Internal server error') {
  return error(message, 500, 'SYS_001');
}