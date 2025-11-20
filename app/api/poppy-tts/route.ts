import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response("Missing 'text' in body", { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!apiKey || !voiceId) {
      console.error(
        "Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID env vars"
      );
      return new Response("Server TTS not configured", { status: 500 });
    }

    // Call ElevenLabs streaming TTS endpoint
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.9,
          },
        }),
      }
    );

    if (!ttsRes.ok) {
      const err = await ttsRes.text();
      console.error("ElevenLabs TTS error:", ttsRes.status, err);
      return new Response("TTS failed", { status: 500 });
    }

    const audioBuffer = await ttsRes.arrayBuffer();

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Unexpected TTS error:", err);
    return new Response("TTS crashed", { status: 500 });
  }
}
