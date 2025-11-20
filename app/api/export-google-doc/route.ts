export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

export async function POST(req: NextRequest) {
  try {
    const { title, content } = await req.json();

    if (!content || typeof content !== "string") {
      return new NextResponse("Missing content", { status: 400 });
    }

    const docTitle =
      typeof title === "string" && title.trim().length > 0
        ? title
        : "Poppy Action Plan";

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
      console.error("Missing Google OAuth env vars");
      return new NextResponse("Google OAuth not configured", { status: 500 });
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    oauth2Client.setCredentials({ refresh_token: refreshToken });

    // Ensures a fresh access token
    await oauth2Client.getAccessToken();

    const docs = google.docs({ version: "v1", auth: oauth2Client });

    // Create the doc
    const created = await docs.documents.create({
      requestBody: {
        title: docTitle,
      },
    });

    const documentId = created.data.documentId;
    if (!documentId) {
      console.error("No documentId returned from Google Docs API");
      return new NextResponse("Failed to create document", { status: 500 });
    }

    // Insert the content
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
    return NextResponse.json({ docUrl });
  } catch (err: any) {
    console.error("export-google-doc error", err);
    const msg =
      err?.response?.data?.error?.message ||
      err?.message ||
      "Failed to export to Google Docs";
    return new NextResponse(msg, { status: 500 });
  }
}
