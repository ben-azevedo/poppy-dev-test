"use client";

import { useEffect, useState } from "react";
import type { SavedChat } from "../types";

const STORAGE_KEY = "poppySavedChats";

export default function useLocalStorageChats(initialValue: SavedChat[] = []) {
  const [savedChats, setSavedChats] = useState<SavedChat[]>(initialValue);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as SavedChat[];
      if (Array.isArray(parsed)) {
        setSavedChats(parsed);
      }
    } catch (err) {
      console.warn("Failed to parse saved chats", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedChats));
  }, [savedChats]);

  return { savedChats, setSavedChats };
}
