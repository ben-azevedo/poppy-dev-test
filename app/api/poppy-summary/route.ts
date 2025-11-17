// app/api/poppy-summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

type SimpleMessage = {
  role: "user" | "assistant";
  content: string;
};

const SUMMARY_SYSTEM_PROMPT = `
You are Poppy, an AI content coach.

Your task: given the full conversation between Poppy and the user,
produce a SHORT, ACTIONABLE summary in this format:

1. **High-level goal** (1–3 sentences)
2. **Action plan** – a numbered list of concrete steps the user can follow.
   - Each step should be specific and executable.
   - Include examples where helpful.
3. **Next 3 moves** – three very next things the user should do immediately.

Style:
- Clear, concise, practical.
- Use headings and numbered lists.
- No fluff, no rambling.
`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const provider = (body?.provider ?? "claude") as "openai" | "claude";
    const messages = (body?.messages ?? []) as SimpleMessage[];

    const safeMessages =
      messages.length > 0
        ? messages
        : [
            {
              role: "user",
              content:
                "There is no conversation; just give me a generic action plan template.",
            },
          ];

    const { text } = await generateText({
      model:
        provider === "claude"
          ? anthropic("claude-sonnet-4-20250514")
          : openai("gpt-4.1-mini"),
      system: SUMMARY_SYSTEM_PROMPT,
      messages: safeMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    // Log so you can confirm on the server what was generated
    console.log("📄 Generated summary:", text);

    // IMPORTANT: always return { summary: string }
    return NextResponse.json({ summary: text });
  } catch (err) {
    console.error("poppy-summary error", err);
    return new NextResponse("Failed to generate summary", { status: 500 });
  }
}
