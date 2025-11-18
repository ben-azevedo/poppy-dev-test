import { NextRequest } from "next/server";

const UA =
  "Mozilla/5.0 (compatible; PoppyAI-LinkMeta/1.0; +https://poppy.ai)";

async function fetchNoEmbedTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(url)}`,
      {
        headers: {
          "User-Agent": UA,
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const title =
      typeof data?.title === "string" && data.title.trim()
        ? data.title.trim()
        : null;
    return title;
  } catch {
    return null;
  }
}

function extractMeta(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

async function fetchHtmlTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html) return null;
    return (
      extractMeta(
        html,
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i
      ) ||
      extractMeta(
        html,
        /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["'][^>]*>/i
      ) ||
      extractMeta(html, /<title[^>]*>([^<]+)<\/title>/i)
    );
  } catch {
    return null;
  }
}

async function resolveTitle(url: string): Promise<string | null> {
  const noEmbed = await fetchNoEmbedTitle(url);
  if (noEmbed) return noEmbed;
  return await fetchHtmlTitle(url);
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return Response.json(
      { error: "Missing url parameter" },
      { status: 400 }
    );
  }

  try {
    const title = await resolveTitle(url);
    return Response.json({
      url,
      title,
    });
  } catch (err) {
    console.error("link-metadata error", err);
    return Response.json({ url, title: null }, { status: 500 });
  }
}
