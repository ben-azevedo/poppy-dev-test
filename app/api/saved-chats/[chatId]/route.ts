import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatId } = await context.params;
  const { title } = await req.json();

  // verify chat belongs to user
  const { data: chat, error } = await supabaseAdmin
    .from("chats") // make sure this matches your table name
    .select("id, user_id")
    .eq("id", chatId)
    .single();

  if (error || !chat || chat.user_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error: updateError } = await supabaseAdmin
    .from("chats")
    .update({ title })
    .eq("id", chatId);

  if (updateError) {
    console.error(updateError);
    return NextResponse.json(
      { error: "Failed to rename chat" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatId } = await context.params;

  // verify chat belongs to user
  const { data: chat, error } = await supabaseAdmin
    .from("chats")
    .select("id, user_id")
    .eq("id", chatId)
    .single();

  if (error || !chat || chat.user_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error: delError } = await supabaseAdmin
    .from("chats")
    .delete()
    .eq("id", chatId);

  if (delError) {
    console.error(delError);
    return NextResponse.json(
      { error: "Failed to delete chat" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
