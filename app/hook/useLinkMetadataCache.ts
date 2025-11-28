"use client";

import { useEffect, useRef, useState } from "react";

type UseLinkMetadataCacheParams = {
  initialLinks: string[];
};

type LinkTitleMap = Record<string, string>;

const fallbackTitleFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    let path = parsed.pathname.replace(/\/$/, "");
    if (path && path.length > 40) {
      path = path.slice(0, 37) + "…";
    }
    return path ? `${host}${path}` : host || url;
  } catch {
    return url;
  }
};

export default function useLinkMetadataCache({
  initialLinks,
}: UseLinkMetadataCacheParams) {
  const [linkTitleMap, setLinkTitleMap] = useState<LinkTitleMap>({});
  const linkTitleMapRef = useRef<LinkTitleMap>(linkTitleMap);

  useEffect(() => {
    linkTitleMapRef.current = linkTitleMap;
  }, [linkTitleMap]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const uniqueLinks = Array.from(
      new Set(initialLinks.filter(Boolean))
    ) as string[];
    const missing = uniqueLinks.filter(
      (link) => link && !linkTitleMapRef.current[link]
    );
    if (!missing.length) return;

    let cancelled = false;

    const fetchTitles = async () => {
      const entries = await Promise.all(
        missing.map(async (link) => {
          try {
            const res = await fetch(
              `/api/link-metadata?url=${encodeURIComponent(link)}`
            );
            if (!res.ok) {
              return { link, title: null };
            }
            const data = await res.json();
            return {
              link,
              title:
                typeof data?.title === "string" && data.title.trim()
                  ? data.title.trim()
                  : null,
            };
          } catch {
            return { link, title: null };
          }
        })
      );
      if (cancelled) return;
      setLinkTitleMap((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          if (!entry) continue;
          next[entry.link] = entry.title || fallbackTitleFromUrl(entry.link);
        }
        return next;
      });
    };

    fetchTitles();

    return () => {
      cancelled = true;
    };
  }, [initialLinks]);

  return { linkTitleMap, setLinkTitleMap, fallbackTitleFromUrl };
}
