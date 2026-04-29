import { API_ERRORS, SoapNote, SoapRequest, SoapResponse } from "@jane-ai-by-yj/shared";
import { apiError } from "./errors";

const MODEL = "@cf/google/gemma-4-26b-a4b-it";

const SYSTEM_PROMPT = [
  "You are a clinical scribe assistant for an allied-health practitioner",
  "(physiotherapist, counsellor, chiropractor, etc.). Extract a SOAP note from",
  "the session transcript by calling the extractSoapNote tool exactly once.",
  "Do not invent details not present in the transcript. If a section has no",
  "relevant content, pass an empty string for that field. Use clinical phrasing",
  "but stay faithful to the transcript.",
].join(" ");

// Gemma 4 on Workers AI runs through vLLM's OpenAI-compatible endpoint, so
// tools must be in OpenAI shape ({ type, function: { name, description,
// parameters } }) and tool-call arguments come back as a JSON-encoded string,
// not an object.
const TOOLS = [
  {
    type: "function",
    function: {
      name: "extractSoapNote",
      description: "Submit the structured SOAP note for the session.",
      parameters: {
        type: "object",
        required: ["subjective", "objective", "assessment", "plan"],
        properties: {
          subjective: {
            type: "string",
            description:
              "The patient's reported symptoms, history, and concerns in their own words.",
          },
          objective: {
            type: "string",
            description:
              "Observable, measurable findings — vitals, range of motion, posture, test results.",
          },
          assessment: {
            type: "string",
            description: "Clinical impression / diagnosis / progress evaluation.",
          },
          plan: {
            type: "string",
            description: "Treatment plan, follow-up, exercises, referrals.",
          },
        },
      },
    },
  },
];

interface ToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
  // Some Workers AI models use the flat shape; keep it as a fallback.
  name?: string;
  arguments?: unknown;
}

export async function handleSoap(req: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, API_ERRORS.soapInvalidRequest, "expected JSON body");
  }

  const parsed = SoapRequest.safeParse(body);
  if (!parsed.success) {
    return apiError(400, API_ERRORS.soapInvalidRequest, parsed.error.message);
  }

  const t0 = performance.now();
  let result: {
    tool_calls?: ToolCall[];
    response?: string;
    choices?: Array<{ message?: { tool_calls?: ToolCall[]; content?: string } }>;
  } & Record<string, unknown>;
  try {
    result = (await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Transcript:\n\n${parsed.data.transcript}` },
      ],
      tools: TOOLS,
      tool_choice: { type: "function", function: { name: "extractSoapNote" } },
    } as unknown as Parameters<typeof env.AI.run>[1])) as typeof result;
  } catch (e) {
    return apiError(502, API_ERRORS.soapUpstream, (e as Error).message);
  }
  const llmMs = Math.round(performance.now() - t0);

  // Workers AI returns either { tool_calls } at the top level OR an OpenAI
  // chat-completions-shaped { choices: [{ message: { tool_calls } }] }.
  const calls =
    result.tool_calls ?? result.choices?.[0]?.message?.tool_calls ?? [];
  const toolCall = calls.find(
    (c) => (c.function?.name ?? c.name) === "extractSoapNote",
  );
  if (!toolCall) {
    const rawSnippet = JSON.stringify(result).slice(0, 400);
    return apiError(
      502,
      API_ERRORS.soapNoToolCall,
      `model did not call extractSoapNote. raw: ${rawSnippet}`,
    );
  }

  // OpenAI shape: arguments is a JSON-encoded string. Older shape: arguments
  // is already an object. Handle both.
  const rawArgs = toolCall.function?.arguments ?? toolCall.arguments;
  let argsObj: unknown;
  if (typeof rawArgs === "string") {
    try {
      argsObj = JSON.parse(rawArgs);
    } catch (e) {
      return apiError(
        502,
        API_ERRORS.soapInvalidResponse,
        `tool_call arguments was not valid JSON: ${(e as Error).message}`,
      );
    }
  } else {
    argsObj = rawArgs;
  }

  const argsValidated = SoapNote.safeParse(argsObj);
  if (!argsValidated.success) {
    return apiError(
      502,
      API_ERRORS.soapInvalidResponse,
      argsValidated.error.message,
    );
  }

  const payload: SoapResponse = { soap: argsValidated.data, llmMs };
  return Response.json(payload);
}
