"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "poppyBoards";

type BoardDoc = {
  id: string;
  name: string;
  text: string;
};

type Board = {
  id: string;
  title: string;
  description: string;
  links: string[];
  docs: BoardDoc[];
};

export default function useLocalStorageBoards(initialValue: Board[] = []) {
  const [boards, setBoards] = useState<Board[]>(initialValue);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Board[];
      if (Array.isArray(parsed)) {
        setBoards(parsed);
      }
    } catch (err) {
      console.warn("Failed to parse stored boards", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
  }, [boards]);

  return { boards, setBoards };
}
