"use client";

import { useEffect, useRef, useState } from "react";
import BoardsPanel from "./component/Sidebars/BoardsPanel";
import BoardFormPanel from "./component/Sidebars/BoardFormPanel";
import useOrbVisualizer from "./component/useOrbVisualizer";
import useLinkMetadataCache from "./component/useLinkMetadataCache";
import useSpeechRecognition from "./component/useSpeechRecognition";
import HomeMainLayout from "./component/HomeMainLayout";
import OrbExperienceSection from "./component/OrbExperienceSection";
import ChatColumn from "./component/ChatColumn";
import { SignedIn, SignedOut, UserButton, SignInButton, useAuth } from "@clerk/nextjs";
import {
  getTypingDelayForChar,
  computeBaseTypingDelay,
  generateId,
} from "./helpers";
import type {
  Provider,
  Message,
  ContentDoc,
  BoardDoc,
  BoardDocInput,
  Board,
  SavedChat,
} from "./types";

export default function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  const [showOrb, setShowOrb] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPartyMode, setIsPartyMode] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [provider, setProvider] = useState<Provider>("openai"); // Engine
  const [isMuted, setIsMuted] = useState(false);
  const [contentLinks, setContentLinks] = useState<string[]>([]); // Content onboarding state
  const [contentDocs, setContentDocs] = useState<ContentDoc[]>([]);
  const [poppyVoice, setPoppyVoice] = useState<SpeechSynthesisVoice | null>(
    null
  ); // Single chosen voice for Poppy

  const providerRef = useRef<Provider>("openai");
  const audioRef = useRef<HTMLAudioElement | null>(null); // ElevenLabs voice
  const messagesRef = useRef<Message[]>([]);
  const contentLinksRef = useRef<string[]>([]);
  const contentDocsRef = useRef<ContentDoc[]>([]);
  const isMutedRef = useRef(false);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const typingControllerRef = useRef<{ cancel: () => void } | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null); // Scroll container ref

  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);
  const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
  const [selectedSavedChatId, setSelectedSavedChatId] = useState<string | null>(
    null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const {
    isSupported: isSpeechSupported,
    isListening,
    pendingTranscript,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({ language: "en-US" });

  // keep refs in sync so callbacks see latest state
  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    contentLinksRef.current = contentLinks;
  }, [contentLinks]);

  useEffect(() => {
    contentDocsRef.current = contentDocs;
  }, [contentDocs]);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Load boards and saved chats from backend on mount
  useEffect(() => {
    // Wait until Clerk has loaded and the user is signed in
    if (!isLoaded || !isSignedIn) return;

    const loadInitialData = async () => {
      try {
        const [boardsRes, chatsRes] = await Promise.all([
          fetch("/api/boards"),
          fetch("/api/saved-chats"),
        ]);

        if (boardsRes.ok) {
          const boardsData: Board[] = await boardsRes.json();
          setBoards(boardsData);
          if (boardsData.length && selectedBoardIds.length === 0) {
            setSelectedBoardIds([boardsData[0].id]);
          }
        }

        if (chatsRes.ok) {
          const chatsData: SavedChat[] = await chatsRes.json();
          setSavedChats(chatsData);
        }
      } catch (err) {
        console.error("Failed to load initial data", err);
      }
    };

    loadInitialData();
  }, [isLoaded, isSignedIn]);


  // Picks a stable voice for Poppy once voices are available
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;

      const preferred =
        voices.find((v) =>
          /female|woman|girl|emma|olivia|serena|samantha|zoe|uk english/i.test(
            (v.name || "") + " " + (v.lang || "")
          )
        ) || voices[0];

      setPoppyVoice(preferred);
      console.log("🎙 Chosen Poppy voice:", preferred.name, preferred.lang);
    };

    window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
    pickVoice();

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", pickVoice);
    };
  }, []);

  const orbState = isListening
    ? "listening"
    : isSpeaking
    ? "speaking"
    : isThinking
    ? "thinking"
    : "idle";

  const {
    orbCanvasRef,
    poppyImageRef,
    auraStyle,
    innerOrbStyle,
    startVisualizer,
    stopVisualizer,
  } = useOrbVisualizer({
    isSpeaking,
    isListening,
    isThinking,
    orbState,
  });

  // TTS for Poppy's replies
  const speak = async (
    text: string,
    onPlaybackStart?: (info: {
      durationMs?: number;
      audio?: HTMLAudioElement;
    }) => void
  ): Promise<number | undefined> => {
    const notifyPlaybackStart = (
      info: { durationMs?: number; audio?: HTMLAudioElement } = {}
    ) => {
      try {
        onPlaybackStart?.(info);
      } catch (err) {
        console.error("Error in playback start callback", err);
      }
    };

    if (isMutedRef.current) {
      setIsSpeaking(false);
      stopVisualizer();
      notifyPlaybackStart();
      return undefined;
    }

    if (typeof window === "undefined") {
      notifyPlaybackStart();
      return undefined;
    }

    try {
      // Calls ElevenLabs TTS route
      const res = await fetch("/api/poppy-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        console.error("TTS request failed", await res.text());
        setIsSpeaking(false);
        notifyPlaybackStart();
        return undefined;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {}
        URL.revokeObjectURL(audioRef.current.src);
        audioRef.current = null;
        stopVisualizer();
      }

      const audio = new Audio(url);
      audioRef.current = audio;

      let durationMs: number | undefined;
      const metadataPromise = new Promise<void>((resolve) => {
        const capture = () => {
          if (
            typeof audio.duration === "number" &&
            isFinite(audio.duration) &&
            audio.duration > 0
          ) {
            durationMs = audio.duration * 1000;
          }
          resolve();
        };

        if (audio.readyState >= 1) {
          capture();
        } else {
          const handler = () => {
            audio.removeEventListener("loadedmetadata", handler);
            capture();
          };
          audio.addEventListener("loadedmetadata", handler);
          setTimeout(() => {
            audio.removeEventListener("loadedmetadata", handler);
            capture();
          }, 300);
        }
      });

      await metadataPromise;

      const cleanupAudio = () => {
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
      };

      audio.onended = () => {
        cleanupAudio();
        stopVisualizer();
        setIsSpeaking(false);
      };

      await audio.play().then(
        () => {
          setIsSpeaking(true);
          startVisualizer(audio).catch((err) =>
            console.warn("Visualizer failed to start", err)
          );
          notifyPlaybackStart({ durationMs, audio });
        },
        (err) => {
          console.error("Audio playback error", err);
          cleanupAudio();
          stopVisualizer();
          setIsSpeaking(false);
          notifyPlaybackStart({ durationMs });
        }
      );

      return durationMs;
    } catch (err) {
      console.error("Error playing TTS audio", err);
      stopVisualizer();
      setIsSpeaking(false);
      notifyPlaybackStart();
      return undefined;
    }
  };

  const typeOutAssistantReply = async (
    fullText: string,
    providerUsed: Provider = providerRef.current
  ) => {
    const text = fullText ?? "";

    // Finish any ongoing typing animation
    if (typingControllerRef.current) {
      typingControllerRef.current.cancel();
      typingControllerRef.current = null;
    }

    const targetIndex = messagesRef.current.length;
    const newMessage: Message = {
      role: "assistant",
      content: "",
      provider: providerUsed,
    };

    setMessages((prev) => [...prev, newMessage]);

    if (!text) {
      return;
    }

    const updateMessageContent = (nextText: string) => {
      setMessages((prev) => {
        if (!prev[targetIndex]) return prev;
        const cloned = [...prev];
        cloned[targetIndex] = {
          ...cloned[targetIndex],
          content: nextText,
        };
        return cloned;
      });
    };

    let baseDelay = computeBaseTypingDelay(text);

    let cancelled = false;
    let timeoutId: number | null = null;
    let animationCleanup: (() => void) | null = null;
    let resolveTyping: (() => void) | null = null;
    let typingStarted = false;

    const clearScheduled = () => {
      if (timeoutId == null) return;
      if (typeof window === "undefined") {
        clearTimeout(timeoutId);
      } else {
        window.clearTimeout(timeoutId);
      }
      timeoutId = null;
    };

    const finishTyping = () => {
      if (resolveTyping) {
        const resolveFn = resolveTyping;
        resolveTyping = null;
        typingControllerRef.current = null;
        resolveFn();
      }
    };

    const controller = {
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        clearScheduled();
        if (animationCleanup) {
          animationCleanup();
          animationCleanup = null;
        }
        if (audioRef.current) {
          try {
            audioRef.current.pause();
          } catch {}
          audioRef.current = null;
        }
        stopVisualizer();
        setIsSpeaking(false);
        updateMessageContent(text);
        finishTyping();
      },
    };
    typingControllerRef.current = controller;

    const startTyping = (syncInfo?: {
      durationMs?: number;
      audio?: HTMLAudioElement;
    }) =>
      new Promise<void>((resolve) => {
        resolveTyping = resolve;
        const totalChars = text.length;

        const finalize = () => {
          clearScheduled();
          finishTyping();
        };

        if (syncInfo?.audio && totalChars > 0) {
          const audio = syncInfo.audio;
          const expectedDuration =
            syncInfo.durationMs && syncInfo.durationMs > 0
              ? syncInfo.durationMs
              : totalChars * baseDelay;
          let rafId: number | null = null;
          let lastCount = 0;

          const cancelRaf = () => {
            if (rafId !== null) {
              if (typeof window !== "undefined") {
                window.cancelAnimationFrame(rafId);
              } else {
                clearTimeout(rafId);
              }
              rafId = null;
            }
          };

          const step = () => {
            if (cancelled) {
              cancelRaf();
              finalize();
              return;
            }

            const durationMs =
              audio.duration && isFinite(audio.duration) && audio.duration > 0
                ? audio.duration * 1000
                : expectedDuration;
            const progress =
              durationMs > 0 ? (audio.currentTime * 1000) / durationMs : 0;
            const targetCount = Math.max(
              lastCount,
              Math.floor(Math.min(1, progress) * totalChars)
            );

            if (targetCount > lastCount) {
              updateMessageContent(text.slice(0, targetCount));
              lastCount = targetCount;
            }

            if (progress >= 1 || audio.ended) {
              updateMessageContent(text);
              cancelRaf();
              finalize();
              return;
            }

            rafId =
              typeof window !== "undefined"
                ? window.requestAnimationFrame(step)
                : (setTimeout(step, 16) as unknown as number);
          };

          rafId =
            typeof window !== "undefined"
              ? window.requestAnimationFrame(step)
              : (setTimeout(step, 16) as unknown as number);
          animationCleanup = () => {
            cancelRaf();
          };
          return;
        }

        let charIndex = 0;
        const typeNext = () => {
          if (cancelled) {
            finalize();
            return;
          }

          charIndex = Math.min(charIndex + 1, totalChars);
          updateMessageContent(text.slice(0, charIndex));

          if (charIndex >= totalChars) {
            finalize();
            return;
          }

          const typedChar = text.charAt(charIndex - 1);
          const delay = getTypingDelayForChar(typedChar, baseDelay);

          timeoutId =
            typeof window === "undefined"
              ? (setTimeout(typeNext, delay) as unknown as number)
              : window.setTimeout(typeNext, delay);
        };

        animationCleanup = null;
        typeNext();
      });

    let typingPromise: Promise<void> | null = null;
    const beginTyping = (info?: {
      durationMs?: number;
      audio?: HTMLAudioElement;
    }) => {
      if (info?.durationMs && info.durationMs > 0) {
        baseDelay = computeBaseTypingDelay(text, info.durationMs * 1.02);
      }
      if (typingStarted && typingPromise) {
        return typingPromise;
      }
      typingStarted = true;
      typingPromise = startTyping(info);
      return typingPromise;
    };

    let playbackInfo: { durationMs?: number; audio?: HTMLAudioElement } = {};
    try {
      await speak(text, (info) => {
        playbackInfo = info ?? {};
        beginTyping(playbackInfo);
      });
    } catch (err) {
      console.warn("TTS playback failed, continuing typing", err);
    } finally {
      const infoForTyping =
        playbackInfo.audio || playbackInfo.durationMs
          ? playbackInfo
          : undefined;
      if (!typingStarted) {
        beginTyping(infoForTyping);
      }
      await beginTyping(infoForTyping);
    }
  };

  // Sends history + provider + content links + docs to /api/poppy-chat
  const sendToPoppy = async (
    allMessages: Message[],
    usedProvider: Provider,
    links: string[],
    docs: ContentDoc[]
  ) => {
    try {
      console.log(
        "🚀 sendToPoppy with provider:",
        usedProvider,
        "links:",
        links,
        "docs:",
        docs.map((d) => d.name)
      );
      const res = await fetch("/api/poppy-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: usedProvider,
          messages: allMessages,
          contentLinks: links,
          contentDocs: docs,
        }),
      });

      const data = await res.json();
      const reply: string =
        data.reply ??
        "I'm having a little brain fart right now, try asking me again? 😅";

      setIsThinking(false);

      void typeOutAssistantReply(reply, usedProvider);
    } catch (err) {
      console.error(err);
      setIsThinking(false);
    }
  };

  const stopSpeakingAndRevealText = () => {
    if (typingControllerRef.current) {
      typingControllerRef.current.cancel();
      return;
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {}
      audioRef.current = null;
    }
    stopVisualizer();
    setIsSpeaking(false);
  };

  const handleStartExperience = () => {
    setShowOrb(true);

    if (messagesRef.current.length === 0) {
      const intro =
        "Hey, I’m Poppy 👋 I’m your AI content buddy. Tell me what kind of content you make, and I’ll help you turn it into banger posts. What platform are you most active on right now?";
      void typeOutAssistantReply(intro, "openai");
    }
  };

  // Orb mic button
  const handleToggleListening = () => {
    if (isSpeaking && !isListening) {
      stopSpeakingAndRevealText();
      return;
    }

    if (!isSpeechSupported) {
      alert(
        "Your browser doesn’t support voice input. Try Chrome for the full experience."
      );
      return;
    }

    if (isListening) {
      // User is done talking: stop and send the turn
      stopListening();

      const finalText = pendingTranscript.trim();
      if (finalText) {
        const currentProvider = providerRef.current;
        const updated: Message[] = [
          ...messagesRef.current,
          { role: "user", content: finalText },
        ];

        setMessages(updated);
        resetTranscript();
        setIsThinking(true);

        // Use all current links + docs + full history
        const linksForChat =
          selectedBoards.length > 0
            ? Array.from(
                new Set(selectedBoards.flatMap((board) => board.links ?? []))
              )
            : contentLinksRef.current;
        const docsForChat =
          selectedBoards.length > 0
            ? selectedBoards.flatMap((board) =>
                board.docs.map(({ name, text }) => ({ name, text }))
              )
            : contentDocsRef.current;

        void sendToPoppy(updated, currentProvider, linksForChat, docsForChat);
      }
    } else {
      // User is starting a new voice turn
      if (typeof window !== "undefined") {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      resetTranscript(); // clear previous draft
      startListening();
    }
  };

  // Switch brain without wiping conversation
  const handleSetProvider = (nextProvider: Provider) => {
    if (nextProvider === provider) return;
    setProvider(nextProvider);
  };

  // Toggle mute: pauses/resumes current poppy message
  const handleToggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const synth = window.speechSynthesis;

        if (next) {
          // Initiates muted state, pause current speech
          synth.pause();
        } else {
          // Exits muted state, resume current speech if there's something to resume
          if (currentUtteranceRef.current) {
            synth.resume();
          }
        }
      }
      return next;
    });
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const selectedBoards = selectedBoardIds
    .map((id) => boards.find((b) => b.id === id) || null)
    .filter((b): b is Board => b !== null);
  const canSaveCurrentBoard =
    selectedBoards.length > 0 &&
    (contentLinks.length > 0 || contentDocs.length > 0);

  const attachDocsToBoard = (boardId: string, files: FileList | null) => {
    if (!files?.length) return;

    const uploads: BoardDoc[] = [];
    const readers: Promise<void>[] = [];

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      const p = new Promise<void>((resolve) => {
        reader.onload = () => {
          const text = String(reader.result ?? "");
          if (text.trim()) {
            uploads.push({
              id: generateId(),
              name: file.name,
              text,
            });
          }
          resolve();
        };
      });
      readers.push(p);
      reader.readAsText(file);
    });

    Promise.all(readers).then(() => {
      if (!uploads.length) return;
      updateBoard(boardId, (board) => ({
        ...board,
        docs: [...board.docs, ...uploads],
      }));
    });
  };

  const toggleBoardSelection = (boardId: string) => {
    setSelectedBoardIds((prev) =>
      prev.includes(boardId)
        ? prev.filter((id) => id !== boardId)
        : [boardId, ...prev]
    );
  };

  const { linkTitleMap, fallbackTitleFromUrl } = useLinkMetadataCache({
    initialLinks: [
      ...contentLinks,
      ...boards.flatMap((board) => board.links || []),
    ],
  });

  const getLinkDisplayLabel = (url: string) =>
    linkTitleMap[url] || fallbackTitleFromUrl(url);

  const handleBoardFormDocsUpload = async (
    files: FileList | null
  ): Promise<BoardDocInput[]> => {
    if (!files?.length) return [];

    const uploads: BoardDocInput[] = [];
    await Promise.all(
      Array.from(files).map(
        (file) =>
          new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const text = String(reader.result ?? "");
              if (text.trim()) {
                uploads.push({
                  name: file.name,
                  text,
                });
              }
              resolve();
            };
            reader.readAsText(file);
          })
      )
    );

    return uploads;
  };

  const handleCreateBoard = async ({
    title,
    description,
    links,
    docs,
  }: {
    title: string;
    description: string;
    links: string[];
    docs: BoardDocInput[];
  }) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      alert("Give your board a name before saving it.");
      return;
    }
    if (!links.length && !docs.length) {
      alert("Add at least one link or file before creating a board.");
      return;
    }

    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          description: description.trim(),
          links,
          docs,
        }),
      });

      if (!res.ok) {
        console.error("Failed to create board", await res.text());
        alert("Something went wrong saving this board.");
        return;
      }

      const created: Board = await res.json();

      setBoards((prev) => [created, ...prev]);
      setSelectedBoardIds((prev) => [
        created.id,
        ...prev.filter((id) => id !== created.id),
      ]);
    } catch (err) {
      console.error("Failed to create board", err);
      alert("Something went wrong saving this board.");
    }
  };

  const updateBoard = (boardId: string, updater: (board: Board) => Board) => {
    setBoards((prev) => {
      const existing = prev.find((b) => b.id === boardId);
      if (!existing) return prev;

      const updated = updater(existing);

      // fire-and-forget to backend
      fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: updated.title,
          description: updated.description,
          links: updated.links,
          docs: updated.docs,
        }),
      }).catch((err) => {
        console.error("Failed to update board", err);
      });

      return prev.map((b) => (b.id === boardId ? updated : b));
    });
  };

  const handleDeleteBoard = async (boardId: string) => {
    setBoards((prev) => {
      const next = prev.filter((b) => b.id !== boardId);
      setSelectedBoardIds((current) => {
        const filtered = current.filter((id) => id !== boardId);
        if (filtered.length > 0 || next.length === 0) return filtered;
        return next[0] ? [next[0].id] : [];
      });
      return next;
    });

    try {
      const res = await fetch(`/api/boards/${boardId}`, { method: "DELETE" });
      if (!res.ok) {
        console.error("Failed to delete board", await res.text());
      }
    } catch (err) {
      console.error("Failed to delete board", err);
    }
  };

  const handleSaveCurrentChat = async () => {
    const currentMessages = messagesRef.current;
    if (!currentMessages.length) return;

    const firstUserLine =
      currentMessages.find((m) => m.role === "user")?.content.trim() ?? "";
    const preview =
      firstUserLine.length > 40
        ? `${firstUserLine.slice(0, 40)}…`
        : firstUserLine || "Chat notes";

    try {
      const res = await fetch("/api/saved-chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: preview,
          messages: currentMessages,
        }),
      });

      if (!res.ok) {
        console.error("Failed to save chat", await res.text());
        alert("Couldn't save this chat.");
        return;
      }

      const saved: SavedChat = await res.json();
      setSavedChats((prev) => [saved, ...prev]);
      setSelectedSavedChatId(saved.id);
    } catch (err) {
      console.error("Failed to save chat", err);
      alert("Couldn't save this chat.");
    }
  };

  const handleSelectSavedChat = (chatId: string) => {
    const chat = savedChats.find((c) => c.id === chatId);
    if (!chat) return;
    setMessages(chat.messages);
    setSelectedSavedChatId(chatId);
  };

  const handleSaveSelectedBoard = () => {
    if (!selectedBoards.length) {
      alert("Select at least one board to save.");
      return;
    }

    const nextLinks = [...contentLinksRef.current];
    const nextDocs: BoardDoc[] = contentDocsRef.current.map((doc) => ({
      id: generateId(),
      name: doc.name,
      text: doc.text,
    }));

    selectedBoardIds.forEach((boardId) => {
      updateBoard(boardId, (board) => ({
        ...board,
        links: nextLinks,
        docs: nextDocs,
      }));
    });
  };


  const handleDeleteSavedChat = async (chatId: string) => {
    setSavedChats((prev) => prev.filter((chat) => chat.id !== chatId));
    setSelectedSavedChatId((prev) => (prev === chatId ? null : prev));

    try {
      const res = await fetch(`/api/saved-chats/${chatId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        console.error("Failed to delete saved chat", await res.text());
      }
    } catch (err) {
      console.error("Failed to delete saved chat", err);
    }
  };

  const handleRenameSavedChat = async (chatId: string, title: string) => {
    setSavedChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, title } : chat))
    );

    try {
      const res = await fetch(`/api/saved-chats/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        console.error("Failed to rename saved chat", await res.text());
      }
    } catch (err) {
      console.error("Failed to rename saved chat", err);
    }
  };

  // Handle exporting
  const buildHooksDocument = () => {
    const msgs = messagesRef.current;
    if (!msgs.length) {
      const fallbackBody = [
        "# Poppy Content Hooks",
        "",
        "## Goal",
        "Start a conversation with Poppy about your content goals so she can craft hook ideas tailored to your brand.",
        "",
        "## Hooks",
        '1. "Hook 1"',
        '2. "Hook 2"',
        '3. "Hook 3"',
        "",
        "---",
        "",
        "Let me know if you want matching video titles, scripts, or social captions next!",
      ].join("\n");
      return { title: "Poppy Content Hooks", content: fallbackBody };
    }

    const grouped = msgs.reduce(
      (acc, message) => {
        if (message.role === "user") {
          acc.user.push(message);
        } else if (message.role === "assistant") {
          acc.assistant.push(message);
        }
        return acc;
      },
      { user: [] as Message[], assistant: [] as Message[] }
    );

    const firstUser = grouped.user[0]?.content?.trim() ?? "";
    const lastUser =
      grouped.user[grouped.user.length - 1]?.content.trim() ?? firstUser;

    const truncate = (text: string, max: number) =>
      text.length > max ? text.slice(0, max) + "…" : text;

    const findHookText = () => {
      for (let i = grouped.assistant.length - 1; i >= 0; i -= 1) {
        const content = grouped.assistant[i]?.content ?? "";
        if (/hook\s*1/i.test(content) || /title\s*1/i.test(content)) {
          return content;
        }
      }
      return grouped.assistant[grouped.assistant.length - 1]?.content ?? "";
    };

    const parseHooks = (body: string) =>
      body
        ? body
            .split(/\n+/)
            .map((line) =>
              line
                .replace(/^\s*[-*+]\s*/, "")
                .replace(/^\s*\d+[\).\:\-]?\s*/, "")
                .replace(/"(.*)"/, "$1")
                .trim()
            )
            .filter((line) => line.length > 3)
        : [];

    const hookText = findHookText();
    const hooks = (() => {
      const parsed = parseHooks(hookText);
      if (parsed.length) return parsed;
      const trimmed = hookText.trim();
      if (trimmed) return [trimmed];
      return [
        "Here's your first hook idea — keep feeding me your content so I can personalize more!",
      ];
    })();

    const highLevelGoal =
      lastUser ||
      "We outlined how you want Poppy to remix your content voice into fresh hooks.";

    const focusSnippet = firstUser
      .replace(/\s+/g, " ")
      .replace(/["“”]/g, "")
      .trim();
    const baseTitle = focusSnippet ? truncate(focusSnippet, 60) : "Your Brand";
    const title = `Content Hooks Inspired by ${baseTitle}`;

    const lines = [
      `# ${title}`,
      "",
      "## Goal",
      truncate(highLevelGoal.replace(/\s+/g, " ").trim(), 280),
      "",
      "## Hooks",
      ...hooks.map((hook, index) => `${index + 1}. ${hook}`),
      "",
      "---",
      "",
      "Let me know if you want matching video titles, scripts, or social captions next!",
    ];

    return { title, content: lines.join("\n") };
  };

  const openDocOrAlert = (
    docUrl: string | undefined,
    missingMessage: string
  ) => {
    if (docUrl) {
      window.open(docUrl, "_blank");
    } else {
      alert(missingMessage);
    }
  };

  const requestDocExport = async (
    endpoint: string,
    payload: { title: string; content: string },
    failureMessage: string,
    generalErrorMessage: string
  ): Promise<{ docUrl?: string } | null> => {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        alert(failureMessage);
        return null;
      }

      const data = (await res.json()) as { docUrl?: string };
      return data;
    } catch (err) {
      console.error(err);
      alert(generalErrorMessage);
      return null;
    }
  };

  const handleExportTextFile = () => {
    const { title, content } = buildHooksDocument();
    const safeTitle =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "poppy-hooks";

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportGoogleDoc = async () => {
    const { title, content } = buildHooksDocument();
    const result = await requestDocExport(
      "/api/export-google-doc",
      { title, content },
      "Could not export to Google Docs 😭",
      "Something went wrong talking to the export API."
    );
    if (!result) return;
    openDocOrAlert(result.docUrl, "Exported, but I couldn't find the doc URL.");
  };

  const handleExportGoogleDocViaMcp = async () => {
    const { title, content } = buildHooksDocument();
    const result = await requestDocExport(
      "/api/export-google-doc-mcp",
      { title, content },
      "Could not export to Google Docs via MCP 😭",
      "Something went wrong talking to the MCP export API."
    );
    if (!result) return;
    openDocOrAlert(
      result.docUrl,
      "Exported via MCP, but I couldn't find the doc URL."
    );
  };

  const showPendingTranscript = isListening && !!pendingTranscript;

  const chatColumn = (
    <ChatColumn
      orbState={orbState}
      auraStyle={auraStyle}
      innerOrbStyle={innerOrbStyle}
      pendingTranscript={pendingTranscript}
      showPendingTranscript={showPendingTranscript}
      isListening={isListening}
      isPartyMode={isPartyMode}
      onToggleListening={handleToggleListening}
      orbCanvasRef={orbCanvasRef}
      poppyImageRef={poppyImageRef}
      messages={messages}
      messagesContainerRef={messagesContainerRef}
    />
  );

  const boardsPanelNode = (
    <BoardsPanel
      boards={boards}
      selectedBoardIds={selectedBoardIds}
      getLinkDisplayLabel={getLinkDisplayLabel}
      onToggleBoard={toggleBoardSelection}
      onUpdateBoard={updateBoard}
      onDeleteBoard={handleDeleteBoard}
      onAttachDocs={attachDocsToBoard}
      savedChats={savedChats}
      selectedSavedChatId={selectedSavedChatId}
      canSaveChat={messages.length > 0}
      onSaveChat={handleSaveCurrentChat}
      onSelectChat={handleSelectSavedChat}
      onDeleteChat={handleDeleteSavedChat}
      onRenameChat={handleRenameSavedChat}
    />
  );

  const boardFormPanelNode = (
    <BoardFormPanel
      onCreateBoard={handleCreateBoard}
      onAttachDocs={handleBoardFormDocsUpload}
      onSaveSelectedBoard={handleSaveSelectedBoard}
      getLinkDisplayLabel={getLinkDisplayLabel}
      contentLinks={contentLinks}
      contentDocs={contentDocs}
      selectedBoards={selectedBoards}
      canSaveCurrentBoard={canSaveCurrentBoard}
    />
  );

  const handleTogglePartyMode = () => setIsPartyMode((prev) => !prev);

  const orbExperience = (
    <OrbExperienceSection
      chatColumn={chatColumn}
      boardsPanel={boardsPanelNode}
      boardFormPanel={boardFormPanelNode}
    />
  );

  return (
    <>
      <SignedOut>
        <div className="min-h-screen flex items-center justify-center bg-black text-white">
          <div className="space-y-4 text-center">
            <h1 className="text-xl font-semibold">Welcome to Poppy</h1>
            <p className="text-sm text-gray-300">
              Sign in to start chatting and save your boards & conversations.
            </p>
            <SignInButton mode="modal">
              <button className="rounded-full px-6 py-2 text-sm font-semibold bg-white text-black hover:bg-gray-200 transition">
                Sign in with Clerk
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <header className="flex justify-end p-4">
          <UserButton />
        </header>
        <HomeMainLayout
          showOrb={showOrb}
          provider={provider}
          isMuted={isMuted}
          onProviderChange={handleSetProvider}
          onToggleMute={handleToggleMute}
          onStartExperience={handleStartExperience}
          onExportText={handleExportTextFile}
          onExportGoogleDoc={handleExportGoogleDoc}
          onExportGoogleDocViaMcp={handleExportGoogleDocViaMcp}
          orbExperience={orbExperience}
          isPartyMode={isPartyMode}
          onTogglePartyMode={handleTogglePartyMode}
        />
      </SignedIn>
    </>
  );
}
