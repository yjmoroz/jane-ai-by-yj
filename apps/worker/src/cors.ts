// Public demo: CORS open to all. Tighten if/when we add auth.
const HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function cors(res: Response): Response {
  for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
  return res;
}

export function preflight(): Response {
  return cors(new Response(null, { status: 204 }));
}
