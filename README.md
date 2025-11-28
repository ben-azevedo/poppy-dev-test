# Poppy AI – Funky Voice-First Content Buddy

Poppy is an AI sidekick that lets creators talk through their content strategy, feeds on their best links + docs, and answers back with real-time voice, typing, and exports.

## Demo
- Live app: `<LIVE_DEMO_URL>`

## What It Does (Dev Test Requirements)
- Click *Start Experience* → the full-screen orb takes over.
- Talk and Poppy replies out loud via ElevenLabs while the text types in sync.
- Continuous back-and-forth conversation (voice or text) without reloading.
- Poppy’s personality stays playful, encouraging, and a little sassy.
- Onboarding walks through importing YouTube/Instagram/brand docs so Poppy mirrors your voice.
- Engine toggle lets you swap between Claude and OpenAI (Vercel AI SDK v5 tools).
- Party Mode cranks up the funky visuals & animated orb.
- Responsive layout keeps the orb + sidebars usable on mobile.

## Tech Stack
- **Next.js (App Router)** with client-side components for the orb, chat column, and sidebars.
- **Vercel AI SDK v5** – using the new `ai` package:
  - `ai` for `generateText`, `streamText`, tool-calling.
  - `@ai-sdk/openai` + `@ai-sdk/anthropic` providers for OpenAI + Claude.
- **ElevenLabs TTS** for Poppy’s spoken replies.
- **MCP (Model Context Protocol)** stdio server to export summaries straight into Google Docs.
- **Tailwind CSS** for the neon/funky UI plus responsive layouts.
- **TypeScript + React hooks** for voice controls, typing sync, board management, and persistence.

## Getting Started
1. **Install deps**
   ```bash
   npm install
   # or
   pnpm install
   ```
2. **Create `.env.local`**
   ```env
   OPENAI_API_KEY=sk-...
   ANTHROPIC_API_KEY=sk-ant-...
   ELEVENLABS_API_KEY=eleven-...
   ELEVENLABS_VOICE_ID=voice-...
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/oauth2/callback
   GOOGLE_REFRESH_TOKEN=...
   ```
3. **Run the app**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```
4. Visit `http://localhost:3000` and start chatting.

## Deploying to Vercel

1. Push this repo to GitHub.
2. Create a new project on [Vercel](https://vercel.com) and import the repo.
3. In the Vercel project settings, add the same env vars as `.env.local`:
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `ELEVENLABS_API_KEY`
   - `ELEVENLABS_VOICE_ID`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
   - `GOOGLE_REFRESH_TOKEN`
4. Deploy – the app will be available at `https://<project-name>.vercel.app`.

## How to Use It
1. Click **“Start Experience”** so the orb fills the screen.
2. Tell Poppy what kind of content you create and what you need.
3. Paste YouTube/IG/storefront links or drop `.txt/.md` docs into Boards so she learns your voice.
4. Ask for hooks, scripts, copy, or remix ideas and keep the conversation rolling.
5. Say “save this to Google Docs” (or tap the export buttons) and Poppy returns a Doc link generated through MCP.

## Architecture Overview
- **`app/page.tsx`** – orchestrates state machines for voice, chat history, boards, exports, and Party Mode.
- **Components**
  - `app/component/TopControls` – provider toggle, Party Mode, exports.
  - `app/component/OrbVisualizer` – animated canvas orb tied to audio levels.
  - `app/component/ChatTranscript` – markdown chat bubbles with typing pipeline.
  - `app/component/Sidebars/*` – Boards panel + board builder form.
- **AI / Voice**
  - `app/api/poppy-chat` – Vercel AI SDK route with Claude/OpenAI + tool wiring.
  - `app/api/poppy-tts` – ElevenLabs streaming proxy for Poppy’s voice.
  - `app/api/poppy-voice` – microphone capture + transcription helpers.
- **Exports**
  - `app/api/export-google-doc` – direct Google Docs API helper.
  - `app/api/export-google-doc-mcp` + `mcp-server.ts` – MCP stdio bridge to Google Docs.
- **Hooks**
  - `useSpeechRecognition`, `useOrbVisualizer`, `useLocalStorageBoards/Chats`, etc. keep logic modular.

## How This Meets the Dev Test Brief
- **Voice-first conversation** – mic button toggles Web Speech API + ElevenLabs speech back.
- **Continuous experience** – no page reloads; history persists and can be saved/renamed.
- **Onboarding story** – hero + boards explain importing content so Poppy mirrors your brand voice.
- **Claude + OpenAI** – switch brains with the Engine toggle (both via Vercel AI SDK v5 tools).
- **Party/funky vibe** – animated orb, Party Mode gradients, playful microcopy.
- **Mobile friendly** – orb + panels collapse and stack cleanly on small screens.
- **Google Docs export** – “boss fight” requirement handled via MCP tool-calling from within chat.

## Challenges & Deep Dives
- **Backend Auth & Data Architecture** – How Clerk, Firebase (Firestore + Auth), and Supabase work together: custom Firebase tokens from Clerk, Firestore Security Rules, realtime board reads, and cascading deletes on user removal. [Full writeup](docs/backend-auth.md)
- **Localtunnel + Clerk Webhooks** – Using localtunnel to expose the local Next.js dev server so Clerk can reach `/api/clerk-webhook`, wiring up the `user.deleted` event, and handling rotating tunnel URLs during development. [Full writeup](docs/localtunnel-webhook.md)
- **MCP Google Docs Export** – Full pipeline from OAuth → MCP server → AI SDK tool → chat narration. [Full writeup](docs/mcp-google-docs.md)
- **Typing + TTS Sync** – Keeping ElevenLabs playback and on-screen typing perfectly in sync so Poppy “talks while she types.” [Full writeup](docs/typing-tts-sync.md)
- **Double Messages Bug** – Removing side-effects from React state updaters to stop duplicate API calls/responses. [Full writeup](docs/double-messages-bug.md)


## Firebase client env vars

These are used by `lib/firebaseClient.ts` to initialize the Firebase Web SDK:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

