# Jane AI by YJ

> A practitioner taps record, talks through a session, taps stop — and a structured SOAP note appears. The recording survives airplane mode, syncing the moment connectivity returns.

A focused take-home built to demonstrate the technical surface area Jane AI's Staff Mobile Developer role calls for: React Native at scale, AI/audio pipelines, and offline-first sync. **Scope is deliberately narrow** — one cohesive flow, executed with the discipline I'd bring to production, plus an explicit v2 design for the streaming architecture I chose not to ship.

> This README is half the deliverable. The other half is the running app — try it below.

---

## Try it (60 seconds)

**Open the deployed app in Expo Go:**

`<image: media/qr.png — Expo Go QR>` *(see `docs/SHARING.md` to publish a preview channel and regenerate this QR)*

**Backend:** [https://jane-ai-by-yj.y8k7yp9w7h.workers.dev](https://jane-ai-by-yj.y8k7yp9w7h.workers.dev) (`/health` is open)

**Try saying:**

> "Patient says they've had right shoulder stiffness for two weeks after lifting a heavy box. Active range of motion limited to 90 degrees abduction. No radicular symptoms. Plan: resistance band exercises, stretching, follow-up in ten days."

You'll see three latency pills populate (Upload / Transcribe / LLM), then the SOAP note. Try it again with airplane mode on — the recording is queued; turn airplane mode off and the note appears within a few seconds without you tapping anything.

---

## Architecture

```
┌─────────────────────────────────┐         ┌──────────────────────────────────────────┐
│ Expo (managed) mobile           │  HTTPS  │ Cloudflare Worker  (jane-ai-by-yj)       │
│                                 │         │                                          │
│  • expo-audio  (.m4a 16k mono)  │ ──────► │  POST /transcribe  → Deepgram nova-3     │
│  • expo-router (2 screens)      │         │     ├ multipart, ≤25MB, type-checked     │
│  • expo-sqlite (offline queue)  │         │     └ returns TranscribeResponse         │
│  • expo-network (drain on net)  │         │                                          │
│  • zod-validated boundaries     │ ──────► │  POST /soap        → Workers AI Gemma 4  │
│  • LatencyBadges (live)         │         │     ├ tool_choice-forced function call   │
│                                 │         │     └ schema-enforced SoapNote out       │
│                                 │ ◄──────│  zod-validated boundaries on the way out  │
└─────────────────────────────────┘         └──────────────────────────────────────────┘
```

**One Worker, two endpoints, one binding.** The LLM lives behind `env.AI` so there's no second API key, lower added latency (Worker ↔ Workers AI is in-network), and smaller blast radius on rotation. The Deepgram secret is set via `wrangler secret put DEEPGRAM_API_KEY` — never committed, never seen by the client.

**Repo:**

```
jane-ai-by-yj/
├── apps/
│   ├── mobile/    — Expo SDK 54 + expo-router 6 (Expo Go shareable)
│   └── worker/    — Cloudflare Worker (wrangler 4)
└── packages/
    └── shared/    — zod schemas shared by both sides
```

---

## Why these choices

### Expo managed workflow over a bare RN config

Reviewers can scan a QR code and try the app on their own device in 30 seconds. That shareability is the highest-leverage decision for a take-home — anything that costs reviewers a step costs me signal. The trade is real: **for the streaming pipeline I designed below, we'd outgrow Expo Go** and need a custom dev client (whisper.cpp, raw PCM access). I'd make that move when the streaming UX warranted it, not before.

### Workers AI's Gemma 4 26B A4B over a hosted LLM provider

[`@cf/google/gemma-4-26b-a4b-it`](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/) (released April 4, 2026) is a Mixture-of-Experts model: 26B total parameters, only 4B active per forward pass, 256K context, native function calling, native thinking mode. The MoE architecture means **inference latency closer to a 4B-parameter dense model with quality nearer the frontier** — exactly the right place on the curve for a clinician waiting on a SOAP note between patients.

Two more things I'd lose by reaching for an external provider instead:
- A second API key to provision, rotate, audit, and pay for.
- A second network hop. `env.AI.run()` is in-network from the Worker; an external provider adds public-internet round-trip on top of inference time.

### Function calling over JSON-prompt-engineering for structured output

`/soap` defines exactly one tool, `extractSoapNote(subjective, objective, assessment, plan)`, with `tool_choice` set to **force** the model to call it. This collapses an entire failure class:

- No "the model returned malformed JSON" parsing errors.
- No "the model wrapped the JSON in prose" stripping logic.
- No prompt drift over time as the system prompt accumulates "please return only valid JSON" patches.

The `arguments` come back as a JSON string (vLLM/OpenAI shape), which we parse and **validate against the same zod `SoapNote` schema** the mobile app uses for the response. That schema is the contract; if the model violates it we return 502 `soap_invalid_response` with detail rather than a half-baked note.

### Deepgram batch (`/v1/listen` prerecorded) over true WebSocket streaming

A weekend trade I'm honest about. The streaming version requires Durable Objects for per-session state, chunked audio capture (Expo Go can't expose raw PCM frames), and SSE relay back to the device — that's a long-week build, not the right v1 shape. **The v2 design below documents how I'd build it.** Showing the design is part of the staff-level point; faking it isn't.

### sqlite over AsyncStorage for the offline queue

AsyncStorage is fine for "one user, a couple of preferences." A queue with status state machines, retry counts, exponential backoff, and historical lookup wants relational primitives: indexes on `(status, created_at)`, transactional updates, and the ability to query "what's in flight" without scanning every row. expo-sqlite gives us that. It's also closer to what we'd want at clinic scale — when "a couple of recordings" becomes "yesterday's full caseload."

---

## What survives airplane mode

The flow is **always queue-first.** When you tap stop, the recording's `file://` URI, duration, and `created_at` go into sqlite as `status='pending'` *before* any network call. Then the queue's `drain()` runs:

```
pending  ──[transcribe]──►  transcribed  ──[soap]──►  done
   │                           │
   └─[network/5xx]──────────┐  └─[network/5xx]────┐
                            ▼                     ▼
                       (retry w/ backoff)    (retry w/ backoff)
                            │                     │
                       (after 5)             (after 5)
                            ▼                     ▼
                          failed                failed
```

- **Single-flight drain.** A mutex prevents two drains running concurrently.
- **Exponential backoff** capped at 60s. Retriable failures (network, 5xx) put the row back in `pending`/`transcribed`. Non-retriable (4xx, schema errors) increment retries but stop sooner.
- **Connectivity-driven.** `expo-network`'s state listener fires `drain()` on every offline → online transition.
- **Resumable across launches.** Force-quit the app mid-flow; relaunch and `_layout.tsx` opens the DB and triggers a drain immediately.

The point isn't that this is novel — it's that it's the *right primitive* for clinical environments where Wi-Fi is patchy and a clinician has just told their phone something they don't want to lose.

---

## What's instrumented today

- **Per-phase latency surfaced in the UI.** `LatencyBadges` shows Upload / Transcribe / LLM ms in real time, color-coded by status. These three numbers are the SLO targets I'd commit to in production (see below).
- **Boundary-validated everywhere.** Both Worker → Mobile and Mobile → Worker responses are parsed with the same zod schemas from `packages/shared`. Schema mismatches return structured `ApiError` with detail.
- **Worker observability on by default.** `wrangler.jsonc` has `observability.enabled: true, head_sampling_rate: 1`. Every request is sampled into Cloudflare's logs.
- **Honest error model.** No silent fallbacks. Every non-success path on either side is a typed result with a failure code and a `retriable` flag the queue uses to decide policy.

**What I'd add at v2:** Sentry for RN crash + perf, [Reassure](https://github.com/callstack/reassure) for component-level perf regression CI, OTLP traces from the device into PostHog for end-to-end record-stop → SOAP-rendered timing across sessions, plus per-phase histograms (not just the latest sample) on a dashboard.

---

## v2: what we'd build next, designed but not shipped

This is the version I'd ship to clinics. It isn't in v1 because the right v1 was something I could finish.

```
Mobile                      Worker                  Durable Object               Deepgram          Workers AI
──────                      ──────                  ──────────────               ────────          ──────────
expo-audio start               │                          │                          │                 │
chunked 250ms ─POST audio────► │                          │                          │                 │
            ───────────────────┼─upgrade WS──────────────►│                          │                 │
            ◄──── SSE ─────────┼──────────────────────────│ open WS to Deepgram ────►│                 │
                               │                          │ pump audio frames ──────►│                 │
                               │                          │ ◄────── partial ─────────│                 │
            ◄── SSE: partial ──┼──────────────────────────│                          │                 │
            …                  │                          │                          │                 │
expo-audio stop                │                          │                          │                 │
            ───── final ──────►│ POST /soap ──────────────┼──────────────────────────┼────────────────►│
            ◄──── SoapNote ────┼──────────────────────────┼──────────────────────────┼─────────────────│
```

**Why a Durable Object?** Three things a stateless Worker can't do:
1. **WebSocket affinity.** Each session needs a single TCP-level peer talking to one Deepgram socket. DOs give you a single-machine "actor" pinned by session id.
2. **Replay buffer for reconnects.** Network drops mid-session shouldn't lose partial transcripts. The DO can hold the last N seconds of partial results and replay on the next WS upgrade.
3. **Idle eviction.** A 10-minute appointment is a 10-minute connection — too long for a single Worker invocation. DOs hibernate when idle and rehydrate cleanly.

**Backpressure & cancellation.** Each 250ms chunk gets a sequence number. The DO acknowledges; if the device's queue grows past N chunks unacknowledged, it drops the oldest non-essential frames (preserving end-of-utterance) and surfaces a "weak signal" indicator to the user — better than letting the buffer balloon and eventually crashing the WS. Cancellation is a `WS_CLOSE` from the device; the DO drains, finalizes the partial Deepgram response, and offers it to `/soap` even if the user stopped early.

**Cost model at scale.** At 10 clinics × 20 visits/day × 15 min average:
- Deepgram streaming ≈ 50,000 min/month → ~$72/mo at standard pricing.
- Workers AI Gemma 4 inference ≈ ~3,000 calls/day → $1-$3/day depending on token mix.
- Worker requests + DO duration + R2 audio retention — pennies per clinic per day.

At 10,000 clinics, the linear scale becomes meaningful — that's where on-device transcription via whisper.cpp (forfeiting Expo Go for a custom dev client) starts paying for itself, especially in jurisdictions where keeping audio on-device is a compliance win.

---

## What's deliberately missing in v1

I left these out because they're each their own task with their own bar; I'd rather call them out than half-build them.

- **Auth.** No login; everything is single-tenant on-device. Real version: Jane SSO, with the Worker validating a short-lived session token on every request and including `practitioner_id` in the audit trail.
- **Tests.** Zero test suite. Real version: integration tests against the Worker (with a Deepgram fixture for `/transcribe` and a fake AI binding for `/soap`), plus Maestro flows for the mobile golden path and a Reassure baseline on the record screen.
- **Conflict resolution.** Single-device only — `enqueue` is the only writer. Cross-device sync would need a CRDT (or last-write-wins with vector clocks) and a server-side store. The shape of the queue's state machine is friendly to that retrofit.
- **PHI redaction.** The transcript is stored in cleartext on-device and in Worker logs (sampling rate 1). Real version: device-side encryption at rest (`expo-secure-store` for the DB key, sqlcipher for the data), and PII stripping before any non-essential log emit.
- **On-device transcription fallback.** Sketched in v2 but not built. The trade is Expo Go → custom dev client.

---

## Mobile performance as a system-level concern

The role calls out "mobile performance as a system-level concern, including defining SLOs, building monitoring and observability and preventing regressions across releases." A first cut at the SLOs I'd hold this app to:

| Metric | p50 target | p95 target | Source |
|---|---|---|---|
| **record-stop → first byte of SOAP** | 3.0 s | 5.0 s | client trace |
| **upload → transcribe** | 1.5 s | 3.5 s | server `deepgramMs` |
| **transcribe → SOAP** | 2.0 s | 4.5 s | server `llmMs` |
| **offline-queue drain on reconnect** | < 2 s | < 5 s | client trace |
| **cold start to first paint** | < 1.2 s | < 2.5 s | RN startup metric |
| **frame budget on record screen** | 60 fps | no drops > 50ms | RN profiler / Reassure |

**Regression prevention** in CI:

- Reassure baseline on the record screen, fails CI if render time on a fixed dataset regresses > 10%.
- Cold-start measurement on a CI device farm (`expo-dev-launcher` integrated into the CI's mobile runner), fails on regression.
- Bundle-size budget on `expo-router/entry.bundle` (iOS/Android), fails CI on unexplained growth > 5%.
- Server-side: latency budgets per endpoint as Cloudflare Workers Analytics alerts.

---

## How it's built — implementation notes

- **Monorepo:** npm workspaces (`apps/*`, `packages/*`) with a single `tsconfig.base.json` everyone extends. Mobile and Worker each have a paths-alias to `@jane-ai-by-yj/shared` so the same zod schemas validate both sides of the wire.
- **Mobile entry:** `expo-router` with `app/_layout.tsx` + `app/index.tsx` + `app/note/[id].tsx`. Nothing fancy — file-based routes, typed via Expo's `experiments.typedRoutes`.
- **Recorder:** `useRecorder` hook wrapping `expo-audio`, returning a small state machine (`idle / permission_denied / recording / recorded / error`) plus a live `elapsedMs` from `useAudioRecorderState`.
- **API client:** `apps/mobile/src/api/client.ts` exposes `transcribe(uri)` and `generateSoap(transcript)` returning a discriminated `ApiResult<T>` with a `retriable: boolean` flag the queue uses to decide policy. Network failures and schema-parse failures get separate error codes — the queue treats them differently.
- **Queue:** `apps/mobile/src/storage/queue.ts` is the only writer to the `recordings` table. State transitions go through `setStatus()`; failures go through `recordFailure()` which centralizes the backoff/cap logic. `drain()` is single-flight via a module-level promise.
- **Worker:** `apps/worker/src/index.ts` is a 30-line router. Endpoints live in `transcribe.ts` and `soap.ts`. CORS wide-open for the demo; in production this would be tightened to the Jane domain with a tightened `Access-Control-Allow-Origin` and an auth header on every request.
- **Wrangler config:** SDK 54-friendly compat date (2026-04-15), `nodejs_compat_v2`, `ai: { binding: "AI", remote: true }` so `wrangler dev` hits the real AI cluster locally too.

---

## Running locally

**Once:**

```bash
git clone <repo>
cd jane-ai-by-yj
npm install                       # installs all 3 workspaces
cp apps/mobile/.env.example apps/mobile/.env   # already points at the deployed Worker
```

**Mobile:**

```bash
cd apps/mobile
npx expo start          # scan the QR with Expo Go
```

**Worker (only if you want to deploy your own):**

```bash
cd apps/worker
npx wrangler login
npx wrangler secret put DEEPGRAM_API_KEY    # paste your Deepgram key
npx wrangler deploy
# then update apps/mobile/.env with your URL
```

**Typecheck everything:**

```bash
npm run typecheck
```

---

## About me

I'm YJ — based in Toronto. Built this in a weekend to give Raj and Thibaut something concrete to react to, and the v2 sketch above to give us something to talk about in the interview.
