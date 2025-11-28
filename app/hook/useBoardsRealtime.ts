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
