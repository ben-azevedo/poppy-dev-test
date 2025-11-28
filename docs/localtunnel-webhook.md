### Issue: Clerk Webhook + User Data Cleanup

This document explains how the **Clerk user deletion webhook** is wired into the app, how it cleans up data in **Firestore** and **Supabase**, and why we use **localtunnel** during development.

---

## 1. What problem does this solve?

Originally, when a user was deleted in Clerk:

- Their **boards** in Firestore were still there
- Their **chats** and **messages** in Supabase were still there

So we had “ghost data” tied to users that no longer existed.

The fix:

- Listen to Clerk’s `user.deleted` webhook
- When a user is deleted, we:
  - Delete their **boards** from Firestore
  - Delete their **chats** and related **messages** from Supabase

---

## 2. The webhook route

File: `app/api/clerk-webhook/route.ts`

```ts
// app/api/clerk-webhook/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { Webhook } from "svix";
import { firestore } from "@/lib/firebaseAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function cleanupUserData(userId: string) {
  console.log("🧹 Cleaning up data for deleted user:", userId);

  // 1) Delete Firestore boards
  try {
    const boardsSnap = await firestore
      .collection("boards")
      .where("userId", "==", userId)
      .get();

    if (!boardsSnap.empty) {
      const batch = firestore.batch();
      boardsSnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      console.log(`🗑 Deleted ${boardsSnap.size} boards for user ${userId}`);
    } else {
      console.log(`ℹ️ No boards found for user ${userId}`);
    }
  } catch (err) {
    console.error("Error deleting Firestore boards for user", userId, err);
  }

  // 2) Delete Supabase chats + messages
  try {
    const { data: chats, error: chatsError } = await supabaseAdmin
      .from("chats")
      .select("id")
      .eq("user_id", userId);

    if (chatsError) {
      console.error("Error loading chats for user", userId, chatsError);
      return;
    }

    if (!chats || chats.length === 0) {
      console.log(`ℹ️ No chats found for user ${userId}`);
      return;
    }

    const chatIds = chats.map((c) => c.id);

    // delete messages first
    const { error: msgsError } = await supabaseAdmin
      .from("messages")
      .delete()
      .in("chat_id", chatIds);

    if (msgsError) {
      console.error("Error deleting messages for user", userId, msgsError);
    }

    // now delete chats
    const { error: delChatsError } = await supabaseAdmin
      .from("chats")
      .delete()
      .in("id", chatIds);

    if (delChatsError) {
      console.error("Error deleting chats for user", userId, delChatsError);
    } else {
      console.log(`🗑 Deleted ${chatIds.length} chats for user ${userId}`);
    }
  } catch (err) {
    console.error("Error deleting Supabase chats for user", userId, err);
  }
}

export async function POST(req: Request) {
  // 1) Get raw payload for Svix verification
  const payload = await req.text();

  // 2) Read the Svix headers from the request
  const hdrs = headers();
  const svixId = hdrs.get("svix-id");
  const svixTimestamp = hdrs.get("svix-timestamp");
  const svixSignature = hdrs.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing Svix headers" },
      { status: 400 }
    );
  }

  // 3) Load the Clerk webhook signing secret
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("CLERK_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  const wh = new Webhook(webhookSecret);

  // 4) Verify and parse the event
  let evt: any;
  try {
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const type = evt.type as string;
  console.log("🔔 Clerk webhook event:", type);

  // 5) Handle user.deleted
  if (type === "user.deleted") {
    const userId = evt.data.id as string;
    await cleanupUserData(userId);
  }

  return NextResponse.json({ received: true });
}
Summary:
When Clerk sends user.deleted, this route:

Verifies the request using Svix + CLERK_WEBHOOK_SECRET

Calls cleanupUserData(userId)

That function deletes:

Firestore boards where userId matches

Supabase messages and chats where user_id matches

3. Environment variables
Make sure these are defined in .env.local (for dev) and in your production environment.

bash
Copy code
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
CLERK_WEBHOOK_SECRET=...   # from Clerk webhook endpoint

# Supabase (service role for server-side admin access)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Firestore (used by firebaseAdmin)
GOOGLE_APPLICATION_CREDENTIALS=...  # or whatever your admin SDK setup requires
⚠️ CLERK_WEBHOOK_SECRET is the webhook signing secret from Clerk’s Webhooks UI, not the same as CLERK_SECRET_KEY.

4. Why we use localtunnel in development
The core issue
Clerk is a hosted service. It needs to send an HTTP POST to your webhook:

text
Copy code
POST https://your-public-url/api/clerk-webhook
But in development, your app only runs on:

text
Copy code
http://localhost:3000
That’s not publicly reachable from Clerk’s servers.

Solution: tunnel localhost to the internet
We use localtunnel to expose localhost:3000 through a public URL.

Example:

bash
Copy code
npx localtunnel --port 3000
This will give you something like:

text
Copy code
https://late-wings-drive.loca.lt
Now your webhook URL becomes:

text
Copy code
https://late-wings-drive.loca.lt/api/clerk-webhook
Why localtunnel instead of ngrok?
No account required

No auth token required

Simple, one command

Good enough for local testing

Ngrok works too, but it needs signup + an authtoken, which adds friction when you just want webhooks working quickly in dev.

5. Configuring the webhook in Clerk
Go to Clerk Dashboard → Webhooks → Add endpoint.

Set the URL to your tunnel URL + /api/clerk-webhook, e.g.:

text
Copy code
https://late-wings-drive.loca.lt/api/clerk-webhook
Under Events, at minimum enable:

user.deleted

After creating the endpoint, Clerk shows you a signing secret.

Copy that and set:

bash
Copy code
CLERK_WEBHOOK_SECRET=whsec_...
Restart your dev server:

bash
Copy code
npm run dev
6. How to test the full flow
Start Next.js dev server:

bash
Copy code
npm run dev
Start localtunnel in another terminal:

bash
Copy code
npx localtunnel --port 3000
Update Clerk webhook URL to use the current localtunnel URL.

In your app:

Sign up / sign in as a test user

Create a board

Create a chat and some messages

In the Clerk dashboard:

Delete that user

Check your dev server logs. You should see something like:

text
Copy code
🔔 Clerk webhook event: user.deleted
🧹 Cleaning up data for deleted user: user_...
🗑 Deleted 1 boards for user user_...
🗑 Deleted 1 chats for user user_...
Verify in Firestore + Supabase:

No boards for that userId

No chats or messages for that userId

7. Mental model
Clerk: owns authentication and user lifecycle.

Our app (Firestore + Supabase): owns domain data (boards, chats, messages).

Webhook: the bridge that keeps them in sync when a user is deleted.

Localtunnel: the dev-time hack that lets Clerk reach localhost:3000 so we can test the webhook locally.

Once this is set up, deleting a user in Clerk automatically wipes their related data from our backend, keeping everything clean.