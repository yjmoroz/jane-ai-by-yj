import {
  TranscribeResponse,
  SoapResponse,
  type TranscribeResponse as TranscribeResponseT,
  type SoapResponse as SoapResponseT,
} from "@jane-ai-by-yj/shared";

const BASE = process.env.EXPO_PUBLIC_API_BASE;
if (!BASE) {
  // Loud failure at module load — better to crash early than silently send
  // requests to undefined.
  throw new Error(
    "EXPO_PUBLIC_API_BASE is not set. Add it to apps/mobile/.env (see .env.example).",
  );
}

export type ApiSuccess<T> = {
  ok: true;
  value: T;
  uploadMs: number;
  serverMs: number;
};
export type ApiFailure = {
  ok: false;
  error:
    | "network"
    | "schema_parse_failed"
    | "upstream"
    | "client_error"
    | "unknown";
  detail?: string;
  retriable: boolean; // network + 5xx are retriable; 4xx are not
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

interface FetchOpts {
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function timedFetch(
  url: string,
  init: RequestInit,
  opts: FetchOpts = {},
): Promise<{ res: Response; uploadMs: number } | { error: ApiFailure }> {
  const ctrl = new AbortController();
  const onParentAbort = () => ctrl.abort();
  if (opts.signal) opts.signal.addEventListener("abort", onParentAbort);

  const timeoutId =
    opts.timeoutMs && opts.timeoutMs > 0
      ? setTimeout(() => ctrl.abort(), opts.timeoutMs)
      : undefined;

  const t0 = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const uploadMs = Math.round(performance.now() - t0);
    return { res, uploadMs };
  } catch (e) {
    return {
      error: {
        ok: false,
        error: "network",
        detail: (e as Error).message,
        retriable: true,
      },
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (opts.signal) opts.signal.removeEventListener("abort", onParentAbort);
  }
}

async function readBodyAndClassify(
  res: Response,
): Promise<{ json: unknown; failure?: ApiFailure }> {
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    return {
      json: null,
      failure: {
        ok: false,
        error: "upstream",
        detail: `non-JSON response (status ${res.status})`,
        retriable: res.status >= 500,
      },
    };
  }
  if (!res.ok) {
    const errCode =
      (json as { error?: string })?.error ?? `http_${res.status}`;
    const detail = (json as { detail?: string })?.detail;
    return {
      json: null,
      failure: {
        ok: false,
        error: res.status >= 500 ? "upstream" : "client_error",
        detail: detail ? `${errCode}: ${detail}` : errCode,
        retriable: res.status >= 500,
      },
    };
  }
  return { json };
}

export async function transcribe(
  audioUri: string,
  opts: FetchOpts = {},
): Promise<ApiResult<TranscribeResponseT>> {
  const fd = new FormData();
  // React Native FormData accepts { uri, name, type } object as a "file".
  fd.append("audio", {
    uri: audioUri,
    name: "audio.m4a",
    type: "audio/m4a",
  } as unknown as Blob);

  const result = await timedFetch(
    `${BASE}/transcribe`,
    { method: "POST", body: fd },
    { timeoutMs: 60_000, ...opts },
  );
  if ("error" in result) return result.error;

  const { json, failure } = await readBodyAndClassify(result.res);
  if (failure) return failure;

  const parsed = TranscribeResponse.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: "schema_parse_failed",
      detail: parsed.error.message,
      retriable: false,
    };
  }
  return {
    ok: true,
    value: parsed.data,
    uploadMs: result.uploadMs,
    serverMs: parsed.data.deepgramMs,
  };
}

export async function generateSoap(
  transcript: string,
  opts: FetchOpts = {},
): Promise<ApiResult<SoapResponseT>> {
  const result = await timedFetch(
    `${BASE}/soap`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    },
    { timeoutMs: 60_000, ...opts },
  );
  if ("error" in result) return result.error;

  const { json, failure } = await readBodyAndClassify(result.res);
  if (failure) return failure;

  const parsed = SoapResponse.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: "schema_parse_failed",
      detail: parsed.error.message,
      retriable: false,
    };
  }
  return {
    ok: true,
    value: parsed.data,
    uploadMs: result.uploadMs,
    serverMs: parsed.data.llmMs,
  };
}
