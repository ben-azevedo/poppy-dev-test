// app/api/firebase-token/route.ts
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
