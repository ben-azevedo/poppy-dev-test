// app/api/poppy-voice/route.ts
import { NextRequest, NextResponse } from "next/server";

// Make sure this route runs on the Node runtime (not edge)
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = body?.text;

    if (!text || typeof text !== "string") {
      return new NextResponse("Missing 'text' in body", { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID; // your custom "Poppy" voice

    if (!apiKey || !voiceId) {
      console.error(
        "Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID env var"
      );
      return new NextResponse("TTS not configured", { status: 500 });
    }

    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1", // you can change to another ElevenLabs model if you want
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.9,
            style: 0.7,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error("ElevenLabs TTS error:", ttsRes.status, errText);
      return new NextResponse("TTS failed", { status: 500 });
    }

    const audioArrayBuffer = await ttsRes.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuffer);

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("poppy-voice route error:", err);
    return new NextResponse("TTS route error", { status: 500 });
  }
}