import type { ApiErrorCode } from "@jane-ai-by-yj/shared";

export function apiError(
  status: number,
  error: ApiErrorCode | string,
  detail?: string,
): Response {
  return Response.json({ error, ...(detail ? { detail } : {}) }, { status });
}
