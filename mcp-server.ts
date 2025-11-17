// mcp-server.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";

// ---- Google Docs helper ----

function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Google OAuth env vars. Need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN (and optional GOOGLE_REDIRECT_URI)."
    );
  }

  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return oAuth2Client;
}

// ---- MCP server setup ----

const server = new McpServer(
  {
    name: "poppy-google-docs",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.registerTool(
  "export_poppy_summary_to_google_doc",
  {
    title: "Export text to Google Docs",
    description:
      "Creates a Google Doc in the connected account from a given title and content string.",
  },
  async (rawArgs: any) => {
    // 👀 Log exactly what we got
    console.error(
      "🔧 MCP tool called with rawArgs:",
      JSON.stringify(rawArgs, null, 2)
    );

    // Handle:
    // 1) { title, content }
    // 2) { arguments: { title, content } }
    const args = rawArgs?.arguments ?? rawArgs ?? {};

    let titleArg = "Poppy Export (MCP)";
    if (typeof args.title === "string" && args.title.trim().length > 0) {
      titleArg = args.title.trim();
    }

    let content = "";
    if (typeof args.content === "string" && args.content.trim().length > 0) {
      content = args.content;
    }

    // If we *still* don't have content, dump the raw args into the doc
    if (!content) {
      content =
        "Raw MCP args (no 'content' field found):\n\n" +
        JSON.stringify(rawArgs, null, 2);
    }

    console.error("🧾 Resolved MCP args:", {
      titleArg,
      contentLength: content.length,
    });

    try {
      const auth = createOAuthClient();
      const docs = google.docs({ version: "v1", auth });

      // 1️⃣ Create doc
      const created = await docs.documents.create({
        requestBody: {
          title: titleArg,
        },
      });

      const documentId = created.data.documentId;
      if (!documentId) {
        throw new Error("Google Docs API did not return a documentId");
      }

      // 2️⃣ Insert content
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: content,
              },
            },
          ],
        },
      });

      const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;

      console.error("✅ Created Google Doc via MCP:", docUrl);

      return {
        structuredContent: { docUrl },
        content: [
          {
            type: "text",
            text: `Created Google Doc: ${docUrl}`,
          } as any,
        ],
      };
    } catch (err: any) {
      console.error("export_poppy_summary_to_google_doc error:", err);
      throw new Error(
        err?.message || "Failed to create Google Doc from MCP server."
      );
    }
  }
);

// ---- stdio bootstrap ----

async function main() {
  console.log("🚀 Starting Poppy Google Docs MCP server (stdio)...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("❌ Fatal MCP server error", err);
  process.exit(1);
});
