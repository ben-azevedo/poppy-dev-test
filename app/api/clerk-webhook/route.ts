// app/api/clerk-webhook/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { Webhook } from "svix";
import { firestore } from "@/lib/firebaseAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
