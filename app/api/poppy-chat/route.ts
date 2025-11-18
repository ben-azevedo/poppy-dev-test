import { NextRequest } from "next/server";
import { generateText, jsonSchema } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `
You are Poppy – a playful, friendly, slightly sassy *female* AI content coach.

Your job:
- Help new Poppy users understand how to use Poppy to create content.
- Focus on onboarding: teach them they can import their YouTube, Instagram, TikTok, landing pages, and other sales/marketing content.
- Explain that those assets become their "brand voice" and "content brain" inside Poppy.
- Show them that once their content is in Poppy, it can:
  - Generate hooks, titles, scripts, email copy, and ad copy in their voice.
  - Remix and repurpose content into new formats.
  - Imitate the *structure* and *style* of their best-performing ads.

Style:
- Fun, upbeat, encouraging, but never cringey.
- Keep answers clear and concrete; avoid huge monologues.
- Ask short, focused questions to move the conversation forward.
- Assume the user is a creator/founder/marketer trying to grow.

Constraints:
- NO technical explanation of how the backend works.
- Keep it in the “I’m your AI buddy helping you make banger content” vibe.
- When using their source content, talk about it like:
  "Based on this ad titled '...', here's a hook in the same style..."
`;

type SimpleMessage = {
  role: "user" | "assistant";
  content: string;
};

type LinkSummary = {
  url: string;
  title?: string;
  description?: string;
  transcript?: string;
};

type ContentDoc = {
  name: string;
  text: string;
};

async function exportToGoogleDocViaMcp(
  title: string | undefined,
  content: string
): Promise<string> {
  console.log("🛠️ exportToGoogleDocViaMcp called with title:", title);
  console.log("📝 content preview:", content.slice(0, 200));

  const safeTitle =
    typeof title === "string" && title.trim().length > 0
      ? title.trim()
      : "Poppy Export";

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "mcp-server.ts"],
    env: process.env,
  });

  const client = new Client({
    name: "poppy-chat-api",
    version: "1.0.0",
  });

  try {
    await client.connect(transport);
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "export_poppy_summary_to_google_doc",
          arguments: {
            title: safeTitle,
            content,
          },
        },
      },
      CallToolResultSchema
    );

    let docUrl: string | undefined;
    const structured: any = (result as any).structuredContent;
    if (structured && typeof structured.docUrl === "string") {
      docUrl = structured.docUrl;
    } else if (Array.isArray(result.content)) {
      for (const item of result.content) {
        if (item?.type === "text" && typeof item.text === "string") {
          const match = item.text.match(
            /https:\/\/docs\.google\.com\/document\/d\/[^\s]+/i
          );
          if (match) {
            docUrl = match[0];
            break;
          }
        }
      }
    }

    if (!docUrl) {
      console.error("MCP tool call result missing docUrl:", result);
      throw new Error("MCP export did not return a doc URL");
    }

    return docUrl;
  } finally {
    try {
      await client.close();
    } catch {}
    try {
      await transport.close();
    } catch {}
  }
}

const poppyTools = {
  export_poppy_summary_to_google_doc: {
    description:
      "Creates a Google Doc via MCP when the user asks to export/save/send their summary, plan, hooks, or next steps.",
    inputSchema: jsonSchema<{
      title?: string;
      content: string;
    }>({
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Optional Google Doc title to use for the export.",
        },
        content: {
          type: "string",
          description:
            "Markdown content to send to Google Docs (include hooks, plan, next steps, etc.).",
        },
      },
      required: ["content"],
    }),
    execute: async ({ title, content }: { title?: string; content: string }) => {
      console.log("🧰 Tool called: export_poppy_summary_to_google_doc", {
        title,
        contentPreview: content.slice(0, 200),
      });
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("content is required to export a Google Doc");
      }
      const docUrl = await exportToGoogleDocViaMcp(title, content);
      return { docUrl };
    },
  },
};

// --- Helpers for YouTube transcript fetching ---

function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function getYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);

    if (u.hostname.includes("youtu.be")) {
      // e.g. https://youtu.be/VIDEO_ID
      const id = u.pathname.replace("/", "");
      return id || null;
    }

    if (u.hostname.includes("youtube.com")) {
      // e.g. https://www.youtube.com/watch?v=VIDEO_ID
      const v = u.searchParams.get("v");
      if (v) return v;

      // e.g. /shorts/VIDEO_ID
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.split("/")[2] ?? null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function fetchYouTubeTranscript(
  url: string
): Promise<string | undefined> {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return;

  try {
    const transcriptRes = await fetch(
      `https://video.google.com/timedtext?lang=en&v=${videoId}`,
      {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; PoppyAI-OnboardingBot/1.0; +https://example.com)",
        },
      }
    );

    if (!transcriptRes.ok) {
      console.warn("YouTube transcript response not OK for", url);
      return;
    }

    const xml = await transcriptRes.text();
    if (!xml || xml.trim().length < 10) {
      console.warn("YouTube transcript XML empty/too small for", url);
      return;
    }

    const matches = Array.from(xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g));
    if (!matches.length) return;

    const pieces = matches.map((m) => decodeXmlEntities(m[1]).trim());
    const fullTranscript = pieces.join(" ").replace(/\s+/g, " ");

    if (!fullTranscript) return;

    // Keep it sane for context (models don't need entire hour-long transcript)
    return fullTranscript.slice(0, 6000); // ~6k chars as a soft cap
  } catch (err) {
    console.warn("Error fetching YouTube transcript for", url, err);
    return;
  }
}

// --- Metadata scraper for links (title/description) ---

async function fetchLinkSummary(url: string): Promise<LinkSummary | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; PoppyAI-OnboardingBot/1.0; +https://example.com)",
      },
    });

    if (!res.ok) {
      console.warn("Non-OK response fetching", url, res.status);
      return { url };
    }

    const html = await res.text();

    const getMeta = (pattern: RegExp): string | undefined => {
      const match = html.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
      return undefined;
    };

    const ogTitle = getMeta(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i
    );
    const ogDescription = getMeta(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i
    );
    const metaDescription = getMeta(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i
    );
    const titleTag = getMeta(/<title[^>]*>([^<]+)<\/title>/i);

    const title = ogTitle || titleTag;
    const description = ogDescription || metaDescription;

    return {
      url,
      title,
      description,
    };
  } catch (err) {
    console.warn("Error fetching link summary for", url, err);
    return { url };
  }
}

// Builds rich link summaries including transcripts where possible
async function buildLinkSummaries(urls: string[]): Promise<LinkSummary[]> {
  const metaResults = await Promise.all(urls.map((u) => fetchLinkSummary(u)));

  const withTranscripts = await Promise.all(
    metaResults.map(async (s) => {
      if (!s) return null;
      if (isYouTubeUrl(s.url)) {
        const transcript = await fetchYouTubeTranscript(s.url);
        return { ...s, transcript };
      }
      return s;
    })
  );

  return withTranscripts.filter(Boolean) as LinkSummary[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = (body?.messages ?? []) as SimpleMessage[];

    // ✅ default to Claude
    const provider = (body?.provider ?? "claude") as "openai" | "claude";

    const contentLinks: string[] = Array.isArray(body?.contentLinks)
      ? body.contentLinks
      : [];

    const contentDocs: ContentDoc[] = Array.isArray(body?.contentDocs)
      ? body.contentDocs
          .filter(
            (d: any) =>
              d &&
              typeof d.name === "string" &&
              typeof d.text === "string" &&
              d.text.trim().length > 0
          )
          .slice(-5) // last few docs
      : [];

    const safeMessages =
      messages.length > 0
        ? messages
        : [{ role: "user", content: "Hey Poppy! Help me get started." }];

    console.log("🔌 Backend provider:", provider);
    console.log("📎 Content links:", contentLinks);
    console.log(
      "📄 Content docs:",
      contentDocs.map((d) => d.name)
    );

    // Fetch summaries for a few links (to keep prompt size reasonable)
    let linkSummaries: LinkSummary[] = [];
    if (contentLinks.length > 0) {
      // Use the *most recent* links so users feel their last paste actually matters
      const MAX_LINKS = 10;
      const limited = contentLinks.slice(-MAX_LINKS);

      linkSummaries = await buildLinkSummaries(limited);
    }

    const linksContext =
      linkSummaries.length > 0
        ? `
The user has provided these source content links (ads, videos, sales pages, etc.).
Treat them as reference material for structure, tone, and messaging:

${linkSummaries
  .map((s) => {
    const title = s.title ? `Title: "${s.title}"` : "Title: (unknown)";
    const desc = s.description
      ? `Summary: ${s.description.slice(0, 300)}`
      : "Summary: (no description available)";
    const transcriptSnippet = s.transcript
      ? `Transcript snippet: ${s.transcript.slice(0, 1200)}`
      : "Transcript: (not available or not fetched)";

    return `- URL: ${s.url}
  ${title}
  ${desc}
  ${transcriptSnippet}`;
  })
  .join("\n\n")}

Use these to:
- Infer the style, tone, and structure of the user's best-performing ads or content.
- Generate new hooks, angles, and copy that *feel* similar, but adapted to whatever product / avatar / channel they describe.
- When helpful, explicitly say things like:
  "I'm mirroring the style of your ad titled '...'"
Do NOT pretend you've watched the full videos; rely on titles, descriptions, and transcript snippets.
`
        : contentLinks.length > 0
        ? `
The user has shared these content links, but we couldn't fetch titles/descriptions:

${contentLinks.map((l: string) => `- ${l}`).join("\n")}

Still treat them as part of their "source content brain". Speak conceptually:
- Help them think of these as their best-performing ads / emails / videos.
- Ask them which ones perform best and what they like about them.
- Generate copy that *could* match those styles.
`
        : `
The user has not added any content links yet.
Gently encourage them to paste links to:
- Their best-performing ads
- Sales pages
- YouTube / Instagram / TikTok content
Explain that Poppy will use those as reference to generate new hooks, scripts, and copy in a similar style.
`;

    const docsContext =
      contentDocs.length > 0
        ? `
The user has also uploaded text documents that describe their audience, pain points, benefits, or existing copy. Use them heavily as context.

Here are the latest documents with excerpts:

${contentDocs
  .map((d) => {
    const excerpt = d.text.replace(/\s+/g, " ").slice(0, 1500);
    return `- Document: "${d.name}"
  Excerpt: ${excerpt}`;
  })
  .join("\n\n")}

When generating hooks, scripts, and ad copy:
- Use the language and phrasing you see in these documents.
- Reflect the pain points, desires, and positioning you detect here.
- Treat them as "inside the brand brain" – not external sources.
`
        : `
The user has not uploaded any text documents yet.
If relevant, suggest they upload .txt/.md files with:
- ICP descriptions
- Pain points
- Benefits
- Existing winning emails or ads
You will then be able to mirror that language and structure more precisely.
`;

    let rawText: string;

    const toolsContext = `
Tool available:
- export_poppy_summary_to_google_doc:
  * Call this ONLY if the user clearly asks to export/save/send their plan, hooks, summary, or next steps to Google Docs.
  * When calling the tool, choose a descriptive title (use the project name or what they're exporting) and craft Markdown content that includes the relevant pieces (hooks, high-level goal, step-by-step plan, next 3 moves, etc.).
  * The tool returns { "docUrl": "https://docs.google.com/..." }. After using it, tell the user you created a doc and include a clickable Markdown link like [Open it here](docUrl).
  * Do NOT call it unless they explicitly want a Google Doc export.
`;

    const fullSystem = SYSTEM_PROMPT + linksContext + docsContext + toolsContext;

    if (provider === "claude") {
      const { text } = await generateText({
        model: anthropic("claude-sonnet-4-20250514"),
        system: fullSystem,
        messages: safeMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: poppyTools,
        maxSteps: 3,
      });
      rawText = text;
    } else {
      const { text } = await generateText({
        model: openai("gpt-4.1-mini"),
        system: fullSystem,
        messages: safeMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: poppyTools,
        maxSteps: 3,
      });
      rawText = text;
    }

    const replyText = rawText;
    return Response.json({ reply: replyText });
  } catch (err) {
    console.error("poppy-chat error", err);
    return new Response(
      JSON.stringify({
        reply:
          "Poppy: Oof, something glitched on my side. Try asking me again in a sec? 💖",
      }),
      { status: 500 }
    );
  }
}
