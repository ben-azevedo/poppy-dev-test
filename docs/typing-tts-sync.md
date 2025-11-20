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
