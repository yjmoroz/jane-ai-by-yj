import { z } from "zod";

// ──────────────────────────────────────────────────────────────────────────────
// Wire format shared between apps/mobile and apps/worker.
// Both directions parse with these schemas at the boundary; nothing is trusted.
// ──────────────────────────────────────────────────────────────────────────────

// POST /transcribe ------------------------------------------------------------

export const TranscribeResponse = z.object({
  transcript: z.string(),
  audioDurationMs: z.number().int().nonnegative(),
  deepgramMs: z.number().int().nonnegative(),
});
export type TranscribeResponse = z.infer<typeof TranscribeResponse>;

// POST /soap ------------------------------------------------------------------

export const SoapNote = z.object({
  subjective: z.string(),
  objective: z.string(),
  assessment: z.string(),
  plan: z.string(),
});
export type SoapNote = z.infer<typeof SoapNote>;

export const SoapRequest = z.object({
  transcript: z.string().min(1),
});
export type SoapRequest = z.infer<typeof SoapRequest>;

export const SoapResponse = z.object({
  soap: SoapNote,
  llmMs: z.number().int().nonnegative(),
});
export type SoapResponse = z.infer<typeof SoapResponse>;

// Standard error envelope -----------------------------------------------------

export const ApiError = z.object({
  error: z.string(),
  detail: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

export const API_ERRORS = {
  // /transcribe
  transcribeNoAudio: "transcribe_no_audio",
  transcribeTooLarge: "transcribe_too_large",
  transcribeUpstream: "transcribe_upstream",
  transcribeInvalidResponse: "transcribe_invalid_response",
  // /soap
  soapInvalidRequest: "soap_invalid_request",
  soapNoToolCall: "soap_no_toolcall",
  soapInvalidResponse: "soap_invalid_response",
  soapUpstream: "soap_upstream",
} as const;
export type ApiErrorCode = (typeof API_ERRORS)[keyof typeof API_ERRORS];
