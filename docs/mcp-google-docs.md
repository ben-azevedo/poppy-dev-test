### Issue: Google Docs MCP Export (aka The Boss Fight)

The hardest part of this project was getting **“Export to Google Docs”** working end-to-end **via MCP**, driven directly from the **chat**, not from a one-off HTTP route or button.

What I wanted:

- Let the user talk to Poppy as normal.
- When they say something like:
  _“Can you save this plan to a Google Doc for me?”_
- Have the LLM:

  - Decide what content to export,
  - Call an MCP tool,
  - Create a Google Doc in my Drive with that content,
  - And respond in the chat with the **live Google Docs link**.

It sounds simple. It absolutely was not. 😅

---

### 1. Baseline: Talking to Google Docs directly (no MCP yet)

Before MCP even entered the picture, I had to get the Google Docs API happy inside a Next.js app.

**Problems I hit immediately:**

- OpenSSL / Node errors like `ERR_OSSL_UNSUPPORTED`.
- 403s from Google:

  - _“Google Docs API has not been used in this project…”_
  - _“The caller does not have permission”_
  - _“The user’s Drive storage quota has been exceeded”_ (on a brand new account 🙃).

**What actually fixed the Google side:**

- Enabling **both**:

  - Google Docs API
  - Google Drive API
    in the same Google Cloud project.

- Stopping the “just use an API key / service account” experiment and using **proper OAuth** instead:

  - Created an OAuth 2.0 Client (Web app).
  - Used OAuth Playground to:

    - Authorize with
      `https://www.googleapis.com/auth/documents` and
      `https://www.googleapis.com/auth/drive`
    - Exchange the auth code for a **refresh token**.

  - Stored these in `.env.local`:

    ```env
    GOOGLE_CLIENT_ID=
    GOOGLE_CLIENT_SECRET=
    GOOGLE_REDIRECT_URI=
    GOOGLE_REFRESH_TOKEN=
    ```

- Built a shared helper on the server:

  ```ts
  function createOAuthClient() {
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oAuth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    return oAuth2Client;
  }
  ```

Once that was working, I had a reliable pattern for:

- Creating a Google Doc with a title.
- Running `documents.batchUpdate` to insert the session content.

That became the foundation for both the **direct export** and the MCP-based export.

---

### 2. MCP server: custom tool to talk to Google Docs

The assignment required using **MCP** (Model Context Protocol), so the next step was to move the Google Docs logic behind a dedicated MCP tool.

#### Server: `mcp-server.ts`

- Uses `@modelcontextprotocol/sdk/server` over **stdio**.
- `dotenv` loads the same Google OAuth env vars from `.env.local`.
- Creates an `McpServer` and registers a single tool:

```ts
server.registerTool(
  "export_poppy_summary_to_google_doc",
  {
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
          description: "Markdown/plaintext body to insert into the doc.",
        },
      },
      required: ["content"],
    },
  },
  async (rawArgs: any) => {
    // Handle both shapes:
    // 1) { title, content }
    // 2) { arguments: { title, content } }
    const args = rawArgs?.arguments ?? rawArgs ?? {};
    const titleArg =
      typeof args.title === "string" && args.title.trim()
        ? args.title.trim()
        : "Poppy Export (MCP)";
    const content = typeof args.content === "string" ? args.content : "";

    if (!content.trim()) {
      throw new Error(
        "MCP tool 'export_poppy_summary_to_google_doc' requires a non-empty 'content' string."
      );
    }

    const auth = createOAuthClient();
    const docs = google.docs({ version: "v1", auth });

    // 1️⃣ Create the doc
    const created = await docs.documents.create({
      requestBody: { title: titleArg },
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
  }
);
```

Key wrinkles here:

- The MCP SDK sometimes wraps arguments in an `arguments` field. If you only read `rawArgs.title`/`rawArgs.content`, you get `undefined`. The final fix was:

  ```ts
  const args = rawArgs?.arguments ?? rawArgs ?? {};
  ```

- `inputSchema` had to be **plain JSON schema**, not a Zod instance, because the MCP SDK **already** uses Zod internally. Mixing them caused fun errors like:

  - `Invalid literal value, expected "object"`
  - `Cannot read properties of undefined (reading 'typeName')`

Once the server could list the tool correctly (`tools/list`) and accept `title` + `content`, it was time to test it.

#### Test client: `test-mcp-client.ts`

To prove MCP worked _independently_ of the Next.js app, I added a tiny test client:

```ts
const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "mcp-server.ts"],
  env: process.env,
});

const client = new Client({
  name: "poppy-test-client",
  version: "1.0.0",
});

await client.connect(transport);

const tools = await client.request(
  { method: "tools/list" },
  ListToolsResultSchema
);

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
```

Running `npm run test:mcp` now:

- Lists the tool with the correct `inputSchema`.
- Calls it with `{ title, content }`.
- Creates a real Google Doc and prints the URL from `structuredContent.docUrl`.

At this point, MCP itself was solid.

---

### 3. Wiring MCP into the chat flow (AI SDK tools)

The final boss: getting this to work through the **chat**, not a manual tool call.

I use `ai` / AI SDK to implement `/api/poppy-chat`. The idea:

- Poppy responds like normal.
- When the user says something like:
  _“Can you save this plan to a Google doc for me?”_
- The model decides to call a **tool**:
  `export_poppy_summary_to_google_doc`.
- The tool implementation spins up the MCP client, calls the MCP tool, and gets a `docUrl`.
- The model then replies in natural language with the link.

#### Tool definition in `poppy-chat` API route

```ts
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
    execute: async ({
      title,
      content,
    }: {
      title?: string;
      content: string;
    }) => {
      console.log("🧰 Tool called: export_poppy_summary_to_google_doc", {
        title,
        contentPreview: content.slice(0, 200),
      });

        content: {
          type: "string",
          description:
            "Markdown content to send to Google Docs (include hooks, plan, next steps, etc.).",
        },
      },
      required: ["content"],
    }),
    execute: async ({
      title,
      content,
    }: {
      title?: string;
      content: string;
    }) => {
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
```

The helper `exportToGoogleDocViaMcp`:

- Spawns the MCP server via `StdioClientTransport` (`npx tsx mcp-server.ts`).
- Calls `tools/call` with `{ title, content }`.
- Extracts `docUrl` from `structuredContent.docUrl` or from the tool’s text.
- Returns that URL back to the AI SDK tool layer.

#### Making the model actually talk about the export

One subtle but important problem:

- Sometimes the model would:

  - Call the tool.
  - Get `docUrl`.
  - **Not** generate any final text.

- That meant `text === ""` and the frontend would show nothing, even though the doc was created.

The fix was to:

1. Use the **full** result from `generateText`, not just `{ text }`:

   ```ts
   const result = await generateText({ ... , tools: poppyTools, maxSteps: 3 });
   const { text, toolResults } = result;
   ```

2. If `text` is empty but there is a tool result for `export_poppy_summary_to_google_doc`, construct the reply manually:

   ```ts
   let replyText = (text ?? "").trim();

   if (!replyText && Array.isArray(toolResults) && toolResults.length) {
     const exportResult = toolResults.find(
       (tr: any) => tr.toolName === "export_poppy_summary_to_google_doc"
     );

     let docUrl: string | undefined;

     if (exportResult) {
       const r = (exportResult as any).result;
       if (typeof r === "string") {
         docUrl = r;
       } else if (r && typeof r === "object" && typeof r.docUrl === "string") {
         docUrl = r.docUrl;
       }
     }

     if (docUrl) {
       replyText = `I exported to Google Doc and here is the link: ${docUrl}`;
     } else {
       replyText =
         "Sorry, I can not export to Google Doc at this time. Please try the export links in the top right corner of the screen instead.";
     }
   }

   if (!replyText.trim()) {
     replyText =
       "I did some work behind the scenes but wasn’t sure what to say back. Tell me what you want next and I’ll help. 💖";
   }

   return Response.json({ reply: replyText });
   ```

Now:

- If the LLM narrates the export itself → that text is used.
- If it just calls the tool and stays silent → the API builds the exact message I want, with the URL.
- If something goes wrong and there’s no URL → the user gets a clear fallback message.

#### Anthropic edge-case: empty messages

When switching between OpenAI and Claude, Anthropic started returning:

> `messages: text content blocks must be non-empty`

The issue: an earlier OpenAI run had produced an empty assistant message which got stored in the history. Claude chokes on any message with blank `content`.

Fix: sanitize messages before passing them into `generateText`:

```ts
const incoming = (body?.messages ?? []) as SimpleMessage[];

const messages = incoming.filter(
  (m) =>
    m &&
    typeof m.content === "string" &&
    m.content.trim().length > 0 &&
    (m.role === "user" || m.role === "assistant")
);

const safeMessages =
  messages.length > 0
    ? messages
    : [{ role: "user", content: "Hey Poppy! Help me get started." }];
```

With this cleanup plus the `toolResults` fallback, both OpenAI and Claude can:

- Respond normally,
- Call the MCP export tool when asked,
- And give the user a clean “here’s your Google Doc link” message in chat.

---

### 4. Where it landed (from the user’s POV)

From the user’s perspective, the whole MCP/GDocs pipeline boils down to:

> **User:** “Can you save this plan to a Google Doc for me?”
> **Poppy:** (internally) calls `export_poppy_summary_to_google_doc` via MCP, creates the doc, grabs the URL
> **Poppy (in chat):** > `I exported to Google Doc and here is the link: https://docs.google.com/...`

Under the hood, that one sentence hides:

- Google OAuth and Docs API setup
- A custom MCP stdio server
- A stdio client baked into the Next.js API route
- AI SDK tools wired into both OpenAI and Claude
- Defensive handling of tool arguments, schemas, and empty messages

This was easily the most complex and finicky part of the project—but now the user just talks to Poppy, and Poppy handles all the Google Docs + MCP chaos behind the scenes.
