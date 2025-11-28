# Backend & Authentication Architecture

## Overview

The backend and authentication architecture is centered on:

- **Clerk** – primary identity provider (sign-up, sign-in, sessions, webhooks)
- **Firebase / Firestore** – real-time storage for user “boards”
- **Supabase** – relational storage for chats and messages
- **Next.js API routes** – all server-side logic (AI calls, boards, chats, webhooks)
- **Firebase Admin SDK** – server-side Firestore access + custom token minting
- **Firebase Web SDK** – client-side Firestore access authenticated via custom tokens

Clerk is the source of truth for user identity. Firebase Auth is used solely as a delegated identity layer so that Firestore Security Rules can enforce per-user access to board documents. Supabase holds chat and message history and is only accessed from the backend via a service-role key.

## Architecture

### Systems

From `package.json`, `lib/`, and `app/`:

- **Next.js 16 (App Router)**
  - `app/` directory, `app/layout.tsx`, `app/page.tsx`
  - `app/api/**/route.ts` API routes for boards, chats, webhooks, AI, etc.
- **Clerk**
  - `@clerk/nextjs` for client + server usage
  - `app/layout.tsx` wraps the app in `<ClerkProvider>`
  - `proxy.ts` configures `clerkMiddleware` as Next.js middleware
- **Firebase**
  - Admin SDK: `lib/firebaseAdmin.ts` for admin Firestore + Auth
  - Web SDK: `lib/firebaseClient.ts` for client Firestore + Auth
- **Supabase**
  - `lib/supabaseAdmin.ts` for server-side admin client
- **AI / External APIs**
  - Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`)
  - ElevenLabs and Google APIs (TTS and Docs export)
  - MCP server (`mcp-server.ts`)

These are orthogonal to auth but run behind API routes.

### Data Responsibilities

**Clerk**

- User accounts, sessions
- Webhooks for lifecycle events (notably `user.deleted`)

**Firestore (via Firebase)**

- `boards` collection
- Real-time read access via client Web SDK
- Writes via backend API routes using Admin SDK

**Supabase**

- `chats` and `messages` tables
- Read/write only via server-side API routes using service role key

**Next.js API routes**

- `app/api/firebase-token/route.ts` – mint Firebase custom tokens
- `app/api/boards/**` – CRUD for boards in Firestore
- `app/api/saved-chats/**` – CRUD for chats/messages in Supabase
- `app/api/clerk-webhook/route.ts` – webhook for Clerk `user.deleted`
- Additional routes for AI chat, TTS, metadata, Google Docs export, etc.

## Authentication Flow

### Clerk wiring

`app/layout.tsx`:

```tsx
import { ClerkProvider } from "@clerk/nextjs";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
````

`proxy.ts`:

```ts
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

In `app/page.tsx`:

```tsx
import { SignedIn, SignedOut, UserButton, SignInButton, useAuth } from "@clerk/nextjs";

// ...
<SignedOut>...Clerk sign-in UI...</SignedOut>
<SignedIn>...main app with <UserButton />...</SignedIn>
```

Clerk is the primary identity provider: all backend routes that need a user call `auth()` from `@clerk/nextjs/server`. The `userId` returned from Clerk is used consistently as the ownership key across Firestore and Supabase.

### Bridging Clerk to Firebase Auth

#### Firebase Admin initialization

`lib/firebaseAdmin.ts`:

```ts
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  throw new Error("Missing Firebase env vars");
}

privateKey = privateKey.replace(/\\n/g, "\n");

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export const firestore = getFirestore();
export const adminAuth = getAuth();
```

Required env vars:

* `FIREBASE_PROJECT_ID`
* `FIREBASE_CLIENT_EMAIL`
* `FIREBASE_PRIVATE_KEY` (with `\n` newlines normalized at runtime)

#### Firebase Web SDK initialization

`lib/firebaseClient.ts`:

```ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);
export const firebaseAuth = getAuth(app);
```

Client env vars:

* `NEXT_PUBLIC_FIREBASE_API_KEY`
* `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
* `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
* `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
* `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
* `NEXT_PUBLIC_FIREBASE_APP_ID`

#### Minting custom tokens: `/api/firebase-token`

`app/api/firebase-token/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminAuth } from "@/lib/firebaseAdmin";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const token = await adminAuth.createCustomToken(userId);
    return NextResponse.json({ token });
  } catch (err) {
    console.error("Error creating Firebase custom token", err);
    return NextResponse.json(
      { error: "Failed to create token" },
      { status: 500 }
    );
  }
}
```

Behavior:

* Authenticates using Clerk (`auth()`).
* Requires a `userId` or returns `401 Unauthorized`.
* Calls `adminAuth.createCustomToken(userId)` and returns `{ token }`.
* Logs errors and returns `500` if minting fails.

#### Client sign-in with custom token

`app/hook/useFirebaseUser.ts`:

```ts
import { useEffect, useState } from "react";
import { firebaseAuth } from "@/lib/firebaseClient";
import { signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { useUser } from "@clerk/nextjs";

export function useFirebaseUser() {
  const { user, isLoaded } = useUser();
  const [ready, setReady] = useState(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!isLoaded) return;

    if (!user) {
      setReady(false);
      return;
    }

    const unsub = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      if (fbUser) {
        setReady(true);
        return;
      }

      try {
        const res = await fetch("/api/firebase-token");
        if (!res.ok) throw new Error("Failed to get Firebase token");
        const { token } = await res.json();
        await signInWithCustomToken(firebaseAuth, token);
        setReady(true);
      } catch (err) {
        console.error("Error signing into Firebase", err);
        setReady(false);
      }
    });

    return () => unsub();
  }, [isLoaded, user]);

  return { ready, userId };
}
```

Key points:

* Waits for Clerk’s `useUser()` to be loaded.
* If no Clerk user exists, `ready` is `false` and no Firebase sign-in is attempted.
* Once a Clerk user exists, it listens to Firebase Auth state:

  * If already signed in, marks `ready = true`.
  * Otherwise, calls `/api/firebase-token` and `signInWithCustomToken`.
* Exposes:

  * `ready: boolean` – “Firebase Auth is signed in and usable”
  * `userId: string | null` – Clerk user ID

This hook centralizes the Clerk ⇄ Firebase Auth bridging.

## Data Storage

### Firestore (Boards)

#### Data model

Boards are stored in the `boards` collection via `lib/firebaseAdmin.firestore`:

* **Collection**: `boards`

Fields (inferred from `app/api/boards` and `[boardId]` routes):

```ts
type BoardDoc = {
  id: string;             // per-board doc field inside `docs` array
  name: string;
  text: string;
};

type Board = {
  id: string;             // Firestore doc ID (not stored in the doc itself)
  title: string;
  description: string;
  links: string[];
  docs: BoardDoc[];
  // plus server-managed fields:
  // userId: string;
  // createdAt: Date;
  // updatedAt?: Date;
};
```

Server-side creation (`app/api/boards/route.ts`):

```ts
// POST /api/boards
const { userId } = await auth();
// ...
const boardDoc: Omit<Board, "id"> & { userId: string; createdAt: Date } = {
  userId,
  title,
  description,
  links,
  docs: docs.map((d, idx) => ({
    id: crypto.randomUUID?.() ?? String(idx),
    name: d.name,
    text: d.text,
  })),
  createdAt: new Date(),
};

const docRef = await firestore.collection("boards").add(boardDoc);
```

Every board document includes a `userId` field set to the Clerk user ID and a `createdAt` timestamp. This is critical for both server-side authorization and Firestore Security Rules.

Server-side reads:

```ts
// GET /api/boards
const snapshot = await firestore
  .collection("boards")
  .where("userId", "==", userId)
  .orderBy("createdAt", "desc")
  .get();
```

Server-side updates/deletes: `app/api/boards/[boardId]/route.ts`

* **PATCH** `/api/boards/:boardId`:

  * Validates Clerk user ID.

  * Calls a helper `getUserBoard(boardId, userId)` that:

    ```ts
    const doc = await firestore.collection("boards").doc(boardId).get();
    if (!doc.exists) return null;
    const data = doc.data() as any;
    if (data.userId !== userId) return null;
    ```

  * If ownership matches, updates with a partial payload and sets `updatedAt`.

* **DELETE** `/api/boards/:boardId`:

  * Same `getUserBoard` ownership check.
  * Deletes the document.

These routes ensure that all writes carry a valid Clerk user and respect per-user ownership, independent of Firestore rules.

#### Realtime reads with Firestore Web SDK

`app/hook/useBoardsRealtime.ts`:

```ts
import { useEffect, useState } from "react";
import { db } from "@/lib/firebaseClient";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import type { Board } from "../types";

export function useBoardsRealtime(opts: {
  firebaseReady: boolean;
  userId: string | null;
}) {
  const [boards, setBoards] = useState<Board[]>([]);

  useEffect(() => {
    if (!opts.firebaseReady || !opts.userId) {
      setBoards([]);
      return;
    }

    const q = query(
      collection(db, "boards"),
      where("userId", "==", opts.userId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as any),
        }));
        setBoards(docs as Board[]);
      },
      (error) => {
        console.error("[boards realtime] snapshot error", error);
        setBoards([]); // fail closed instead of blowing up UI
      }
    );

    return () => unsub();
  }, [opts.firebaseReady, opts.userId]);

  return boards;
}
```

* Only starts a listener once `firebaseReady === true` and `userId` is non-null.
* Uses `where("userId", "==", opts.userId)` and `orderBy("createdAt", "desc")`.
* Handles errors (including potential `permission-denied`) by logging and clearing the local list.

#### Usage in `app/page.tsx`

At the top of the main page:

```tsx
const { isLoaded, isSignedIn } = useAuth();
const { ready: firebaseReady, userId } = useFirebaseUser();

// Boards come from Firestore realtime hook
const boards = useBoardsRealtime({ firebaseReady, userId });
const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);

// Auto-select first board once available
useEffect(() => {
  if (boards.length > 0 && selectedBoardIds.length === 0) {
    setSelectedBoardIds([boards[0].id]);
  }
}, [boards, selectedBoardIds]);
```

Rendering and gating:

* Signed-out users see a Clerk sign-in prompt.
* Signed-in users see:

  ```tsx
  <SignedIn>
    {!firebaseReady ? (
      <>
        <header className="flex justify-end p-4">
          <UserButton />
        </header>
        <div className="text-sm text-slate-400 px-4">
          Connecting to Firestore…
        </div>
      </>
    ) : (
      <>
        <header className="flex justify-end p-4">
          <UserButton />
        </header>
        <HomeMainLayout
          // ...
          orbExperience={orbExperience}
        />
      </>
    )}
  </SignedIn>
  ```

So the Firestore-dependent UI only appears once Firebase Auth is fully initialized.

### Supabase (Chats & Messages)

#### Supabase admin client

`lib/supabaseAdmin.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceRoleKey) {
  throw new Error("Supabase env vars are not set");
}

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
```

* Uses service-role key (`SUPABASE_SERVICE_ROLE_KEY`) and is explicitly “server-side only.”
* The client URL is `NEXT_PUBLIC_SUPABASE_URL`, but this module is never imported on the client.

#### Saved chats listing and creation

`app/api/saved-chats/route.ts`:

**GET** `/api/saved-chats`:

```ts
const { userId } = await auth(); // Clerk
// Fetch chats
const { data: chats } = await supabaseAdmin
  .from("chats")
  .select("id, title, created_at")
  .eq("user_id", userId)
  .order("created_at", { ascending: false });

// Fetch messages for all chats
const { data: messages } = await supabaseAdmin
  .from("messages")
  .select("id, chat_id, role, content, provider, created_at")
  .in("chat_id", chatIds)
  .order("created_at", { ascending: true });

// Group by chat_id and format into SavedChat[]
```

**POST** `/api/saved-chats`:

```ts
const { userId } = await auth();
// Insert into chats with user_id = userId
const { data: chat } = await supabaseAdmin
  .from("chats")
  .insert({ user_id: userId, title })
  .select()
  .single();

// Insert messages with chat_id = chat.id
await supabaseAdmin.from("messages").insert(
  messages.map((m) => ({
    chat_id: chat.id,
    role: m.role,
    content: m.content,
    provider: m.provider ?? null,
  }))
);
```

Tables (inferred):

```sql
-- chats
id
user_id        -- Clerk userId
title
created_at

-- messages
id
chat_id        -- FK to chats.id
role           -- "user" | "assistant"
content
provider       -- e.g. "openai" or "anthropic"
created_at
```

#### Chat updates and deletes

`app/api/saved-chats/[chatId]/route.ts`:

**PATCH** `/api/saved-chats/:chatId`:

* Ensures the request is authenticated via Clerk.

* Verifies ownership:

  ```ts
  const { data: chat } = await supabaseAdmin
    .from("chats")
    .select("id, user_id")
    .eq("id", chatId)
    .single();

  if (!chat || chat.user_id !== userId) return 404;
  ```

* Updates `title` for that chat.

**DELETE** `/api/saved-chats/:chatId`:

* Same ownership check.
* Deletes the chat row from `chats`.
* Messages for that chat are not explicitly deleted here; depending on Supabase configuration, those may be cleaned via cascade rules or left as orphaned rows. (This is a potential improvement area.)

#### Frontend usage

`app/page.tsx` loads saved chats once the user is signed in:

```ts
// Load saved chats from backend on mount
useEffect(() => {
  if (!isLoaded || !isSignedIn) return;

  const loadInitialData = async () => {
    try {
      const chatsRes = await fetch("/api/saved-chats");
      if (chatsRes.ok) {
        const chatsData: SavedChat[] = await chatsRes.json();
        setSavedChats(chatsData);
      }
    } catch (err) {
      console.error("Failed to load initial data", err);
    }
  };

  loadInitialData();
}, [isLoaded, isSignedIn]);
```

All Supabase access is thus backend-only; the browser never talks directly to Supabase.

## Firestore Security Rules

The project documents Firestore rules in `docs/firestore-rules.md`. These are designed to enforce per-user access for the `boards` collection:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    match /boards/{boardId} {
      // Create: user can only create a board for themselves
      allow create: if isSignedIn()
                    && request.resource.data.userId == request.auth.uid;

      // List/query: any signed-in user can run queries on boards
      allow list: if isSignedIn();

      // Get a single board: must own it
      allow get: if isSignedIn()
                 && resource.data.userId == request.auth.uid;

      // Update/delete: must own it
      allow update, delete: if isSignedIn()
                            && resource.data.userId == request.auth.uid;
    }
  }
}
```

How this ties to the code:

* **Authentication**: `request.auth.uid` comes from Firebase Auth, which is initialized with a custom token minted using the Clerk `userId`.
* **Ownership**: every board document written by server-side API routes includes `userId: Clerk userId`.
* **Client reads**: `useBoardsRealtime` queries with `where("userId", "==", opts.userId)`, so both the query and the rules align on `userId`.
* **Server writes**: the boards API routes validate `userId` via Clerk and enforce ownership checks before mutating any Firestore doc. Rules act as a defense-in-depth layer.

## Clerk Webhooks & Cascading Deletes

The app handles user deletions via a Clerk webhook endpoint at `app/api/clerk-webhook/route.ts`.

### Signature verification

```ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { Webhook } from "svix";
import { firestore } from "@/lib/firebaseAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const payload = await req.text();
  const hdrs = await headers();

  const svixId = hdrs.get("svix-id");
  const svixTimestamp = hdrs.get("svix-timestamp");
  const svixSignature = hdrs.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing Svix headers" },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("CLERK_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  const wh = new Webhook(webhookSecret);

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

  if (type === "user.deleted") {
    const userId = evt.data.id as string;
    await cleanupUserData(userId);
  }

  return NextResponse.json({ received: true });
}
```

* Uses Svix (`svix`) to validate the webhook signature.
* Relies on `CLERK_WEBHOOK_SECRET` in the environment.
* Only `user.deleted` is handled; other events are logged but ignored.

### Cascading deletes

```ts
async function cleanupUserData(userId: string) {
  console.log("🧹 Cleaning up data for deleted user:", userId);

  // Delete boards from Firestore
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

  // Delete chats + messages from Supabase
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

    const { error: msgsError } = await supabaseAdmin
      .from("messages")
      .delete()
      .in("chat_id", chatIds);

    if (msgsError) {
      console.error("Error deleting messages for user", userId, msgsError);
    }

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
```

Observations:

* Logs both positive and negative outcomes:

  * “🗑 Deleted X boards/chats…”
  * “ℹ️ No boards/chats found…”
* Handles errors separately for Firestore and Supabase operations.
* Deletes Firestore boards and Supabase chats/messages tied to `userId`.

## End-to-End Auth & Data Flows

### Flow 1: Sign-in → Firebase token → Firestore access (Boards)

1. **User signs in with Clerk**

   * The UI renders `<SignedOut>` or `<SignedIn>` based on `useAuth()`.
   * After login, `SignedIn` content is rendered.

2. **Clerk session propagates to the backend**

   * API routes (e.g. `/api/boards`, `/api/saved-chats`, `/api/firebase-token`) call `auth()` from `@clerk/nextjs/server`.
   * This returns `{ userId }` if the request is authenticated.

3. **Client starts Firebase Auth handshake**

   * `app/page.tsx` calls:

     ```ts
     const { ready: firebaseReady, userId } = useFirebaseUser();
     ```

   * `useFirebaseUser`:

     * Waits for Clerk `useUser()` to load.
     * If there is a Clerk user, attaches a Firebase `onAuthStateChanged` listener.
     * If Firebase is not signed in yet, it calls `/api/firebase-token`.

4. **Backend issues a Firebase custom token**

   * `/api/firebase-token`:

     * Uses Clerk `auth()` to confirm the current user.
     * Calls `adminAuth.createCustomToken(userId)`.
     * Returns `{ token }` to the client.

5. **Client signs into Firebase**

   * `useFirebaseUser` receives `{ token }` and calls:

     ```ts
     await signInWithCustomToken(firebaseAuth, token);
     ```

   * When Firebase Auth emits a user, `ready` is set to `true`.

6. **Realtime boards are fetched from Firestore**

   * Once `firebaseReady` is `true`, `useBoardsRealtime({ firebaseReady, userId })`:

     ```ts
     query(
       collection(db, "boards"),
       where("userId", "==", userId),
       orderBy("createdAt", "desc")
     );
     ```

   * `onSnapshot` delivers live updates to the `boards` array.

   * Firestore Security Rules ensure that only boards with `userId == request.auth.uid` are accessible.

7. **Boards are displayed and selected**

   * `app/page.tsx` auto-selects the first board when data arrives and drives UI components like `BoardsPanel` and `BoardFormPanel`.

### Flow 2: User deletion → Clerk webhook → Firestore + Supabase cleanup

1. **User is deleted in Clerk**

   * An administrator or automated process removes a user account in Clerk’s dashboard.

2. **Clerk sends `user.deleted` webhook**

   * It POSTs to `/api/clerk-webhook` with Svix headers and JSON body containing `data.id` (the Clerk user ID).

3. **Webhook signature is verified**

   * The route uses `CLERK_WEBHOOK_SECRET` and Svix’s `Webhook.verify` to ensure authenticity.
   * If verification fails, it responds with `400` and logs an error.

4. **Cleanup is performed**

   * For `type === "user.deleted"`, the route calls:

     ```ts
     await cleanupUserData(userId);
     ```

   * `cleanupUserData`:

     * Queries Firestore’s `boards` collection where `userId` matches and deletes those documents in a batch.
     * Queries Supabase `chats` where `user_id == userId`, deletes associated `messages` (by `chat_id`), then deletes `chats`.

5. **Logs indicate what happened**

   Examples:

   * `🧹 Cleaning up data for deleted user: <id>`
   * `🗑 Deleted N boards for user <id>`
   * `ℹ️ No boards found for user <id>`
   * `🗑 Deleted N chats for user <id>`
   * `ℹ️ No chats found for user <id>`

## Environment Variables

Only variables actually referenced in the codebase are listed here.

### Clerk

* `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  Used by `ClerkProvider` (implicit) on the client.
* `CLERK_SECRET_KEY`
  Used server-side by Clerk (implicit; not referenced directly in code but required by `@clerk/nextjs`).
* `CLERK_WEBHOOK_SECRET`
  Used in `app/api/clerk-webhook/route.ts` to verify webhook signatures.

### Firebase – Admin

From `lib/firebaseAdmin.ts`:

* `FIREBASE_PROJECT_ID`
* `FIREBASE_CLIENT_EMAIL`
* `FIREBASE_PRIVATE_KEY`

`FIREBASE_PRIVATE_KEY` must include the private key with newlines encoded as `\n` in `.env`; the code replaces them with real newlines before initializing the Admin app.

### Firebase – Web SDK (client)

From `lib/firebaseClient.ts`:

* `NEXT_PUBLIC_FIREBASE_API_KEY`
* `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
* `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
* `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
* `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
* `NEXT_PUBLIC_FIREBASE_APP_ID`

### Supabase

From `lib/supabaseAdmin.ts`:

* `NEXT_PUBLIC_SUPABASE_URL`
  Base URL for the Supabase project (used only server-side here).
* `SUPABASE_SERVICE_ROLE_KEY`
  Service-role key granting full access; used only from server-side code.

### AI / Other (briefly)

The app also uses:

* `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
* `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
* Google OAuth and Docs-related keys

These are referenced in the AI/exports routes and original README, but they do not participate in core auth or persistence.

## Local Development

### Running the app

From `package.json`:

```bash
npm install
npm run dev
```

This starts Next.js on `http://localhost:3000`.

### Configuring Clerk

1. Create a Clerk application.

2. Set:

   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
   CLERK_SECRET_KEY=sk_...
   ```

3. Ensure allowed redirect URLs in Clerk include `http://localhost:3000`.

### Configuring Firebase

1. Create a Firebase project and enable Firestore.

2. Create a service account and download its JSON.

3. Set:

   ```env
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

4. In the Firebase console, create a Web app and use its config for:

   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   ```

5. Apply the Firestore Security Rules shown above in your Firebase console (or via a `firestore.rules` file).

### Configuring Supabase

1. Create a Supabase project.

2. Create tables:

   ```sql
   create table chats (
     id uuid primary key default gen_random_uuid(),
     user_id text not null,
     title text,
     created_at timestamptz default now()
   );

   create table messages (
     id uuid primary key default gen_random_uuid(),
     chat_id uuid references chats(id) on delete cascade,
     role text not null,
     content text not null,
     provider text,
     created_at timestamptz default now()
   );
   ```

3. Set:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=service-role-key
   ```

### Configuring Clerk webhooks (local)

The file `docs/localtunnel-webhook.md` gives a detailed walkthrough. In short:

1. Start the dev server:

   ```bash
   npm run dev
   ```

2. Expose it with a tunnel (e.g. localtunnel):

   ```bash
   npx localtunnel --port 3000 --subdomain your-subdomain
   ```

3. In Clerk’s dashboard:

   * Add a webhook endpoint with URL:

     ```text
     https://your-subdomain.loca.lt/api/clerk-webhook
     ```

   * Subscribe to at least `user.deleted`.

4. Copy the signing secret and set:

   ```env
   CLERK_WEBHOOK_SECRET=whsec_...
   ```

5. Restart the dev server so the env var is picked up.

## Known Limitations & Future Improvements

### Realtime boards are read-only on the client

Boards are written via backend routes (`/api/boards`) using the Admin SDK and read in realtime via Firestore Web SDK. Direct client-side writes (e.g. `addDoc` from the browser) are not currently used, though the rules would support them if `userId` were set correctly.

### Supabase message deletion on chat delete

`/api/saved-chats/[chatId]/DELETE` only deletes from `chats`. Orphaned messages rely on database-level cascades (if configured). Explicit deletion similar to webhook cleanup could be added for consistency.

### Firebase token / auth failure

If `/api/firebase-token` fails or `signInWithCustomToken` throws, `useFirebaseUser` logs an error and sets `ready` to `false`. The UI will remain in a “Connecting to Firestore…” state for signed-in users; more user-friendly error messaging or retry logic could be added.

### Firestore permission issues

`useBoardsRealtime` has an error handler on `onSnapshot` that logs and clears the `boards` array. If rules reject the query (e.g. misconfigured `userId`), boards simply appear empty. Surface-level error UI could be added.

### Webhook noise

The webhook cleanup logs both success and “no data found” messages. In high-volume environments, this may produce noisy logs; structured logging or log levels could be introduced.

### Indexes

The query pattern `where("userId", "==", userId).orderBy("createdAt", "desc")` may require composite indexes in Firestore. Firebase will prompt in the console if an index is missing.

## Summary

* Clerk is the primary identity provider; all user IDs originate from Clerk.
* Firebase Auth is used only as a mirror of Clerk identity via custom tokens, enabling Firestore Security Rules.
* Firestore stores user boards in a `boards` collection, with per-user access enforced by both backend ownership checks and Security Rules keyed on `userId == request.auth.uid`.
* Supabase stores chats and messages in `chats` and `messages` tables, accessed exclusively via server-side routes using a service-role key.
* Clerk webhooks ensure that when a user is deleted, corresponding boards in Firestore and chats/messages in Supabase are also cleaned up.
