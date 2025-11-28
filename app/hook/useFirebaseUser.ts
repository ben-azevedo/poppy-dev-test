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
