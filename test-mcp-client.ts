import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";

async function main() {
  // To spawn MCP server using tsx + mcp-server.ts
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "mcp-server.ts"],
    env: process.env, // forward Google credentials
  });

  const client = new Client({
    name: "poppy-test-client",
    version: "1.0.0",
  });

  console.log("🔌 Connecting to MCP server via stdio...");
  await client.connect(transport);
  console.log("✅ Connected!");

  // List tools to see export-google-doc
  const tools = await client.request(
    { method: "tools/list" },
    ListToolsResultSchema
  );
  console.log("🧰 Tools available:\n", JSON.stringify(tools, null, 2));

  // Call export-google-doc tool
  const result = await client.request(
    {
      method: "tools/call",
      params: {
        name: "export_poppy_summary_to_google_doc",
        arguments: {
          title: "MCP Test Doc from client",
          content:
            "Hello from test-mcp-client.ts!\n\nIf you see this in Google Docs, MCP is working 🎉",
        },
      },
    },
    CallToolResultSchema
  );


  console.log("📄 Tool call result:\n", JSON.stringify(result, null, 2));

  await client.close();
  await transport.close();

  console.log("✅ Done, you can now check your Google Drive for the new doc.");
}

main().catch((err) => {
  console.error("❌ MCP client error:", err);
  process.exit(1);
});
