### Issue: What exactly did we fix with the double messages?

The root bug was this pattern (what you had before):

setMessages((prev) => {
const updated = [...prev, { role: "user", content: transcript }];
void sendToPoppy(updated); // ❌ side-effect inside setState updater
return updated;
});

Two important things here:

Side-effect inside the state updater

The updater function passed to setMessages is supposed to be pure:
“Given prev, return the next state.”

We were doing something extra: calling sendToPoppy(updated) inside that updater. That’s a side-effect.

React 18 dev mode runs updaters twice

In development, React Strict Mode intentionally calls those updaters twice to detect unsafe side effects.

That means this block ran 2x for the same voice input:

1st call → sendToPoppy(updated) ✅

2nd call → sendToPoppy(updated) 😬

Result: two API calls, two replies, two assistant messages.
The browser’s speech engine cancels the first utterance when the second one starts, so you only hear the second.

What we changed:

We removed side-effects from the updater.

We started using a messagesRef and providerRef so callbacks always “see” the latest data.

We call sendToPoppy once per onresult, outside of setMessages:

recognition.onresult = (event) => {
const transcript = event.results[0][0].transcript;

const currentProvider = providerRef.current;

const updated = [
...messagesRef.current,
{ role: "user", content: transcript },
];

// 1) Pure state update
setMessages(updated);

// 2) Side-effect: send to backend ONCE
sendToPoppy(updated, currentProvider).finally(() => {
isProcessingRef.current = false;
});
};

And we:

synced messagesRef with state in a useEffect, and

used isProcessingRef as a guard in case onresult fires twice in dev.

So the fix in one sentence:

We stopped doing side effects inside the React state updater (which dev-mode runs twice) and moved them into a normal function using refs, so each voice turn only triggers one API call.

### Issue: Google Docs MCP Export

Biggest challenge: wiring Google Docs export through MCP (aka The Boss Fight)

The single hardest part of this project was getting “Export to Google Docs” working end-to-end via MCP instead of just calling the Google Docs API directly.

What I wanted:

Take the user’s actionable summary of their Poppy session

Click “Export to Google Docs (MCP)”

Have a Google Doc appear in my Drive with that exact content, and a URL returned to the app

That sounded simple. It wasn’t. 😅

1. First attempt: direct Google Docs API (no MCP)

I started with a straightforward Next.js API route that used googleapis:

I used a service account at first and hit:

ERR_OSSL_UNSUPPORTED (OpenSSL / Node issue)

403 errors like:

“Google Docs API has not been used in this project…”

“The caller does not have permission”

“The user’s Drive storage quota has been exceeded” (on a fresh account 🙃)

What actually fixed this layer:

Enabling the Google Docs API and Drive API in the correct project

Switching away from just an API key to a proper OAuth client:

Creating an OAuth 2.0 client (Web app)

Using the OAuth Playground to:

Authorize with https://www.googleapis.com/auth/documents and https://www.googleapis.com/auth/drive

Exchange the code for a refresh token

Storing these in .env.local as:

GOOGLE_CLIENT_ID

GOOGLE_CLIENT_SECRET

GOOGLE_REDIRECT_URI

GOOGLE_REFRESH_TOKEN

Building a helper to create an OAuth2 client and using that both in the export route and (later) in the MCP server

At this point, the non-MCP export worked: I could POST title + content, and the API route created a Google Doc and inserted text.

2. Adding MCP: custom server + stdio client

The assignment required using MCP (Model Context Protocol), so I added a dedicated MCP server and wired Poppy to call it.

MCP server (mcp-server.ts):

Uses @modelcontextprotocol/sdk/server over stdio

Loads env vars via dotenv from .env.local

Reuses the same OAuth helper as the Next.js side

Registers one tool:

server.registerTool(
"export_poppy_summary_to_google_doc",
{
title: "Export text to Google Docs",
description:
"Creates a Google Doc in the connected account from a given title and content string.",
},
async (rawArgs: any) => {
// read title/content from rawArgs
// create Google Doc via googleapis
// insert the content
// return a docUrl in structuredContent + human text
}
);

Then boots as a stdio server:

const transport = new StdioServerTransport();
await server.connect(transport);

Local MCP test client (test-mcp-client.ts):

Uses @modelcontextprotocol/sdk/client over stdio

Spawns the server with:

const transport = new StdioClientTransport({
command: "npx",
args: ["tsx", "mcp-server.ts"],
env: process.env,
});

Connects a Client, calls tools/list, then:

const result = await client.request({
method: "tools/call",
params: {
name: "export_poppy_summary_to_google_doc",
arguments: {
title: "MCP Test Doc from client",
content: "Hello from test-mcp-client.ts! ...",
},
},
});

This path works: running npm run test:mcp successfully creates a Google Doc with the expected text.

This was the “happy path” for MCP itself.

3. Wiring MCP into the Next.js app

The last step was to make the front-end export button go through MCP instead of talking to Google directly:

Frontend builds a local summary string of the Poppy conversation

It POSTs to /api/export-google-doc-mcp with { title, content }

The Next.js route then:

Spawns the MCP server via StdioClientTransport (npx tsx mcp-server.ts)

Creates a Client and await client.connect(transport)

Calls tools/call on export_poppy_summary_to_google_doc with the same { title, content }

Extracts the docUrl from the tool result and returns it to the browser

This sounds straightforward, but this layer caused multiple rounds of:

Cannot set properties of undefined (setting 'onclose')

Cannot read properties of undefined (reading 'parse')

Zod schema errors about inputSchema.type and outputSchema.type

Differences in how the MCP SDK expects arguments vs. how the server receives them (rawArgs vs rawArgs.arguments)

The final working pattern:

Server side:

Always read arguments defensively:

const args = rawArgs?.arguments ?? rawArgs ?? {};

Client side (both test and API route):

Spawn MCP via stdio (npx tsx mcp-server.ts)

Use the MCP SDK’s Client and StdioClientTransport together in a consistent way

Pass title + content from the app into the MCP tool, instead of assuming MCP would infer it

4. Where it landed

In the end, I have three export paths wired into Poppy:

Plain .txt export – direct download in the browser

Direct Google Docs export – Next.js → Google Docs API with OAuth

Google Docs export via MCP – Next.js → MCP over stdio → Google Docs API

The MCP path uses the same OAuth credentials and Google Docs logic, but goes through a dedicated MCP tool, which satisfies the requirement to integrate MCP into the project.

This was by far the gnarliest part of the build: juggling Google OAuth, Docs API quirks, service vs OAuth flows, Next.js server runtimes, stdio transports, and the MCP SDK’s expectations for tool schemas and argument shapes, all just to reliably create a Google Doc from the Poppy session summary.

### Issue: Typing + TTS Sync (ElevenLabs)

To make the assistant feel more like a real person “typing while talking,” I wired up a custom flow that keeps the on-screen typing animation in sync with ElevenLabs TTS. This went through a few iterations:

1. Initial goal

The core UX goal was:

When the AI speaks, it should type out the response live, not dump a full wall of text and then start reading it.

So I introduced:

typingControllerRef – a controller for managing in-flight typing animations (start, cancel, complete).

typeOutAssistantReply – a helper that:

Appends a new assistant message as an empty “shell” in the chat.

Types the reply character-by-character into that message.

Can cancel previous typing when a new reply starts, while leaving earlier messages fully written.

Both the normal chat flow and the initial onboarding intro were updated to use this helper, so everything shared the same “type as you speak” behavior.

2. First problem: TTS starting late

In the first version, the text started typing immediately while ElevenLabs audio was still being fetched. That caused a noticeable delay that got worse with longer replies:

Message 1: typing started ~2.5 seconds before the voice.

Message 2: typing started ~9 seconds before the voice.

Message 3: typing started ~15 seconds before the voice.

The delay of the voice was directly proportional to the length of the AI response — longer messages took longer before audio playback began. In practice, it looked like ElevenLabs needed time to build the full recording for that chunk of text, and only then started playing it. Meanwhile, the UI was happily typing away from the first character.

Result: the text was way ahead of the audio, especially on long responses.

Fix: move TTS ahead of typing.

typeOutAssistantReply now:

Appends the empty shell message immediately.

Calls ElevenLabs speak to fetch and start audio.

Only after playback begins does it start the typing loop.

Both entry points (sendToPoppy and handleStartExperience) call this helper as a fire-and-forget async function so the React tree doesn’t block.

This aligned the start of the text with the start of the voice, regardless of how long the response was.

3. Second problem: TTS pauses vs. raw typing

Once the start times were aligned, a new mismatch showed up:

ElevenLabs naturally pauses at:

Periods, commas, newlines

Emojis

The typing animation, however, treated every character equally and just blasted through the string.

Result: the text raced ahead again during sentences, because the voice was pausing where the text wasn’t.

Fix: model per-character pacing.

I added two small helpers near the top of app/page.tsx:

isEmoji(char) – detects emoji characters for special handling.

getTypingDelayForChar(char) – returns a delay (in ms) depending on the character that was just shown:

Base letters/numbers: short delay (fast typing).

Spaces: slightly longer.

Commas: longer pause.

Sentence-ending punctuation (., ?, !): even longer pause.

Emojis/newlines: treated like “emotional beats” with their own pause.

The typing loop was then updated to:

// Pseudocode
for each char in text:
append char to message
const delay = getTypingDelayForChar(char)
await sleep(delay)

Now, whenever the TTS pauses, the typing animation also pauses, so they stay much closer over time.

4. Final tuning: text slightly behind the voice

After adding realistic pauses, a new issue:

The text started to lag behind the voice slightly.

The fix here was just tuning numbers, not logic:

Reduced the base letter delay (e.g. from ~58ms → ~48ms).

Reduced delays for:

Spaces

Commas

Sentence-ending punctuation

Emojis / newlines

The idea was to preserve the relative timing (longer pauses where the voice pauses), but make the overall typing just fast enough that it stays roughly in lockstep with the spoken audio instead of trailing.

5. Result

The final behavior:

A new assistant reply:

Adds an empty chat bubble immediately.

Starts ElevenLabs TTS (including whatever time it needs to build the audio).

Begins typing only once the audio actually kicks in.

The typing animation:

Uses character-aware delays to mirror the TTS cadence.

Keeps text and voice visually and audibly aligned over the entire response, even for long messages.

New messages cancel any in-progress typing while leaving old messages fully rendered, keeping the UI responsive.

This iterative approach (measure delays → adjust start timing vs. TTS prep time → model pauses → tune delays) produced a “talk while typing” experience that feels much closer to a real person than just streaming raw text or playing audio after the fact.
