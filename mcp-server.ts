// mcp-server.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
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

async function createGoogleDoc(title: string, content: string) {
  const auth = createOAuthClient();
  const docs = google.docs({ version: "v1", auth });

  // 1️⃣ Create doc
  const created = await docs.documents.create({
    requestBody: {
      title,
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
  return docUrl;
}

// ---- MCP server setup ----

// NOTE: this is the *low-level* Server, not the McpServer helper.
// We manually handle tools/list and tools/call.
const server = new Server(
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

// tools/list → tell clients what tools exist
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "export_poppy_summary_to_google_doc",
        title: "Export text to Google Docs",
        description:
          "Creates a Google Doc in the connected account from a given title and content string.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Optional title for the Google Doc.",
            },
            content: {
              type: "string",
              description:
                "Markdown/plaintext body that will be inserted into the doc.",
            },
          },
          required: ["content"],
        },
      },
    ],
  };
});

// tools/call → actually run the tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error("🛠 CallTool handler invoked:", {
    name,
    args,
  });

  if (name !== "export_poppy_summary_to_google_doc") {
    return {
      content: [
        {
          type: "text",
          text: `Unknown tool: ${name}`,
        },
      ],
      isError: true,
    };
  }

  const titleArg =
    typeof args?.title === "string" && args.title.trim().length > 0
      ? args.title.trim()
      : "Poppy Export (MCP)";

  const content = typeof args?.content === "string" ? args.content : "";

  if (!content.trim()) {
    return {
      content: [
        {
          type: "text",
          text: "MCP tool 'export_poppy_summary_to_google_doc' requires a non-empty 'content' string.",
        },
      ],
      isError: true,
    };
  }

  console.error("🧾 Resolved MCP args:", {
    titleArg,
    contentLength: content.length,
  });

  try {
    const docUrl = await createGoogleDoc(titleArg, content);

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
    return {
      content: [
        {
          type: "text",
          text: err?.message || "Failed to create Google Doc from MCP server.",
        },
      ],
      isError: true,
    };
  }
});

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
