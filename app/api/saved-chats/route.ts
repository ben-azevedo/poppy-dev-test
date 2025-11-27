// app/api/saved-chats/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { SavedChat, Message } from "../../types";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: chats, error: chatsError } = await supabaseAdmin
    .from("chats")
    .select("id, title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (chatsError) {
    console.error(chatsError);
    return NextResponse.json(
      { error: "Failed to fetch saved chats" },
      { status: 500 }
    );
  }

  if (!chats || chats.length === 0) {
    return NextResponse.json([]);
  }

  const chatIds = chats.map((c) => c.id);

  const { data: messages, error: messagesError } = await supabaseAdmin
    .from("messages")
    .select("id, chat_id, role, content, provider, created_at")
    .in("chat_id", chatIds)
    .order("created_at", { ascending: true });

  if (messagesError) {
    console.error(messagesError);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }

  const byChatId: Record<string, Message[]> = {};
  (messages ?? []).forEach((m: any) => {
    if (!byChatId[m.chat_id]) byChatId[m.chat_id] = [];
    byChatId[m.chat_id].push({
      role: m.role,
      content: m.content,
      provider: m.provider ?? undefined,
    });
  });

  const result: SavedChat[] = chats.map((c: any) => ({
    id: c.id,
    title: c.title ?? "",
    savedAt: new Date(c.created_at).getTime(),
    messages: byChatId[c.id] ?? [],
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, messages } = body as {
    title: string;
    messages: Message[];
  };

  // create chat row in "chats"
  const { data: chat, error: chatError } = await supabaseAdmin
    .from("chats")
    .insert({ user_id: userId, title })
    .select()
    .single();

  if (chatError || !chat) {
    console.error(chatError);
    return NextResponse.json({ error: "Failed to save chat" }, { status: 500 });
  }

  // insert messages into "messages"
  if (messages.length) {
    const { error: msgError } = await supabaseAdmin.from("messages").insert(
      messages.map((m) => ({
        chat_id: chat.id,
        role: m.role,
        content: m.content,
        provider: m.provider ?? null, // 👈 store provider
      }))
    );

    if (msgError) {
      console.error(msgError);
      return NextResponse.json(
        { error: "Failed to save messages" },
        { status: 500 }
      );
    }
  }

  const savedChat: SavedChat = {
    id: chat.id,
    title: chat.title ?? "",
    savedAt: new Date(chat.created_at).getTime(),
    messages,
  };

  return NextResponse.json(savedChat, { status: 201 });
}
