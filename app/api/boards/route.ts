// app/api/boards/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { firestore } from "@/lib/firebaseAdmin";
import type { Board, BoardDoc } from "../../types";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await firestore
    .collection("boards")
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .get();

  const boards: Board[] = snapshot.docs.map((doc) => {
    const data = doc.data() as any;
    return {
      id: doc.id,
      title: data.title ?? "",
      description: data.description ?? "",
      links: data.links ?? [],
      docs: (data.docs ?? []) as BoardDoc[],
    };
  });

  return NextResponse.json(boards);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, links, docs } = body as {
    title: string;
    description: string;
    links: string[];
    docs: { name: string; text: string }[];
  };

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

  const created: Board = {
    id: docRef.id,
    title,
    description,
    links: boardDoc.links,
    docs: boardDoc.docs,
  };

  return NextResponse.json(created, { status: 201 });
}
