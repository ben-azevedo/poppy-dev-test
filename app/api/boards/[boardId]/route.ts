// app/api/boards/[boardId]/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { firestore } from "@/lib/firebaseAdmin";
import type { Board, BoardDoc } from "../../../types";

type RouteContext = {
  params: Promise<{ boardId: string }>;
};

async function getUserBoard(boardId: string, userId: string) {
  const doc = await firestore.collection("boards").doc(boardId).get();
  if (!doc.exists) return null;

  const data = doc.data() as any;
  if (data.userId !== userId) return null;

  return { doc, data };
}

export async function PATCH(req: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { boardId } = await context.params;

  const existing = await getUserBoard(boardId, userId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  // Body can have any subset of title/description/links/docs
  const update: any = { ...body, updatedAt: new Date() };

  await firestore.collection("boards").doc(boardId).update(update);

  const updatedSnap = await firestore.collection("boards").doc(boardId).get();
  const data = updatedSnap.data() as any;

  const board: Board = {
    id: updatedSnap.id,
    title: data.title ?? "",
    description: data.description ?? "",
    links: data.links ?? [],
    docs: (data.docs ?? []) as BoardDoc[],
  };

  return NextResponse.json(board);
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 👇 Same fix here
  const { boardId } = await context.params;

  const existing = await getUserBoard(boardId, userId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await firestore.collection("boards").doc(boardId).delete();
  return NextResponse.json({ success: true });
}
