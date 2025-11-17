// app/api/export-google-doc-mcp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

export const runtime = "nodejs"; // ensure Node runtime

export async function POST(req: NextRequest) {
  try {
    const { title, content } = await req.json();

    if (typeof content !== "string" || !content.trim()) {
      return new NextResponse("Missing content", { status: 400 });
    }

    const safeTitle =
      typeof title === "string" && title.trim().length > 0
        ? title.trim()
        : "Poppy Action Plan (MCP)";

    // 🔌 Same pattern as your working test-mcp-client.ts
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", "mcp-server.ts"],
      env: process.env,
    });

    const client = new Client({
      name: "poppy-next-api",
      version: "1.0.0",
    });

    try {
      // Connect to MCP server (spawns mcp-server.ts)
      await client.connect(transport);

      // ✅ IMPORTANT: pass CallToolResultSchema as 2nd arg
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

      console.log("📄 MCP tool result:", JSON.stringify(result, null, 2));

      // Try to extract docUrl from structuredContent or text content
      let docUrl: string | undefined;

      // @ts-ignore – depending on SDK version, structuredContent may exist
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
        console.error("MCP tool call result did not include a docUrl:", result);
        return new NextResponse("MCP export did not return a doc URL", {
          status: 500,
        });
      }

      return NextResponse.json({ docUrl });
    } finally {
      // Clean up
      try {
        await client.close();
      } catch {}
      try {
        await transport.close();
      } catch {}
    }
  } catch (err) {
    console.error("export-google-doc-mcp error", err);
    return new NextResponse("Failed to export via MCP", { status: 500 });
  }
}
