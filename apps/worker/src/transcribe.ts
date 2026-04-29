import { API_ERRORS, TranscribeResponse } from "@jane-ai-by-yj/shared";
import { apiError } from "./errors";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const DEEPGRAM_URL =
  "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true";

interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string }>;
    }>;
  };
}

export async function handleTranscribe(
  req: Request,
  env: Env,
): Promise<Response> {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BYTES) {
    return apiError(413, API_ERRORS.transcribeTooLarge);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError(400, API_ERRORS.transcribeNoAudio, "expected multipart/form-data");
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return apiError(400, API_ERRORS.transcribeNoAudio);
  }
  if (audio.size > MAX_BYTES) {
    return apiError(413, API_ERRORS.transcribeTooLarge);
  }

  const audioBuffer = await audio.arrayBuffer();
  const audioContentType = audio.type || "audio/m4a";

  const t0 = performance.now();
  let upstream: Response;
  try {
    upstream = await fetch(DEEPGRAM_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        "Content-Type": audioContentType,
      },
      body: audioBuffer,
    });
  } catch (e) {
    return apiError(502, API_ERRORS.transcribeUpstream, (e as Error).message);
  }
  const deepgramMs = Math.round(performance.now() - t0);

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return apiError(
      502,
      API_ERRORS.transcribeUpstream,
      `deepgram ${upstream.status}: ${detail.slice(0, 200)}`,
    );
  }

  let body: DeepgramResponse;
  try {
    body = (await upstream.json()) as DeepgramResponse;
  } catch (e) {
    return apiError(502, API_ERRORS.transcribeInvalidResponse, "deepgram returned non-JSON");
  }

  const transcript =
    body.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  const audioDurationMs = Math.round((body.metadata?.duration ?? 0) * 1000);

  const payload = TranscribeResponse.safeParse({
    transcript,
    audioDurationMs,
    deepgramMs,
  });
  if (!payload.success) {
    return apiError(
      502,
      API_ERRORS.transcribeInvalidResponse,
      payload.error.message,
    );
  }

  return Response.json(payload.data);
}
