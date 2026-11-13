export const statuses = {
  INVALID_INPUT: 400, UNKNOWN_REGION: 404, UNSUPPORTED_SCENARIO: 422,
  INSUFFICIENT_DATA: 422, NO_VALID_ROTATION: 422, SERVICE_UNAVAILABLE: 503,
};
export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function requireInput(condition, message) {
  if (!condition) throw new ApiError('INVALID_INPUT', message);
}
