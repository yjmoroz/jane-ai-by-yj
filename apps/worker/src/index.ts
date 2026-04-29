import { cors, preflight } from "./cors";
import { handleSoap } from "./soap";
import { handleTranscribe } from "./transcribe";

declare global {
  interface Env {
    DEEPGRAM_API_KEY: string;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return preflight();

    const url = new URL(req.url);

    if (url.pathname === "/transcribe" && req.method === "POST") {
      return cors(await handleTranscribe(req, env));
    }

    if (url.pathname === "/soap" && req.method === "POST") {
      return cors(await handleSoap(req, env));
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return cors(new Response("ok"));
    }

    return cors(new Response("not found", { status: 404 }));
  },
} satisfies ExportedHandler<Env>;
