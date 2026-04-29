# Publishing the Expo Go preview + capturing the demo

These are the last two steps to make the README self-serve for reviewers. They need a real device, so they can't be automated.

## 1. Set the Deepgram secret on the deployed Worker

One-time. Without this, `/transcribe` returns 502 `transcribe_upstream` (Deepgram 401).

```bash
cd apps/worker
npx wrangler secret put DEEPGRAM_API_KEY
# paste your Deepgram key when prompted
```

Verify:

```bash
npx wrangler secret list      # should show DEEPGRAM_API_KEY
```

End-to-end check (you'll need a small `.m4a`):

```bash
curl -X POST https://jane-ai-by-yj.y8k7yp9w7h.workers.dev/transcribe \
  -F "audio=@apps/worker/test-fixtures/sample.m4a"
```

## 2. Publish a preview channel and regenerate the QR

`expo start` only works while Metro is running on your laptop. For a self-serve QR in the README, publish a preview channel via EAS:

```bash
cd apps/mobile
npx eas-cli login           # one-time
npx eas-cli init            # one-time, picks a project ID
npx eas-cli update --branch preview --message "v0.1 demo"
```

EAS prints a public URL and a QR. Save the QR as `media/qr.png` (or screenshot the QR from `https://qr.expo.dev/eas-update?...`).

Then update the README's "Try it" section to embed `media/qr.png`.

## 3. Capture the 60-second demo

Run the app on a real iOS device. macOS QuickTime can record the device's screen via USB:
- QuickTime → **File → New Movie Recording** → click the dropdown next to the record button → choose your iPhone.

Script (60s total):

| 0:00 — 0:05 | Open the app. Brief framing: "Jane AI by YJ — voice → SOAP note for allied health practitioners." |
| 0:05 — 0:25 | Tap record. Read the sample monologue from README. Tap stop. |
| 0:25 — 0:35 | Latency pills populate. Tap "Open SOAP note." |
| 0:35 — 0:45 | Note view: walk through Subjective / Objective / Assessment / Plan briefly, expand the transcript disclosure. |
| 0:45 — 0:55 | Back to home. Toggle airplane mode on. Record a short clip. Show "queued" state. |
| 0:55 — 1:00 | Toggle airplane mode off. Watch the new note appear in the recent list automatically. |

Compress to <10MB (`ffmpeg -i raw.mov -vcodec libx264 -crf 28 demo.mp4`) and save as `media/demo.mp4`. Or upload as an unlisted YouTube link and embed.

Update README §1 (header) to embed the GIF/MP4.
