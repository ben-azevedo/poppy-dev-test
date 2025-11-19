"use client";

import { useEffect, useRef, useState } from "react";
import TopControls from "./component/TopControls";
import PoppyHero from "./component/PoppyHero";
import ChatTranscript from "./component/ChatTranscript";
import BoardsPanel from "./component/Sidebars/BoardsPanel";
import BoardFormPanel from "./component/Sidebars/BoardFormPanel";
import OrbVisualizer from "./component/OrbVisualizer";
import useOrbVisualizer from "./component/useOrbVisualizer";
import useLinkMetadataCache from "./component/useLinkMetadataCache";

const isEmojiChar = (char: string): boolean => {
  if (!char) return false;
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return false;
  return (
    (codePoint >= 0x1f300 && codePoint <= 0x1f6ff) || // Misc symbols + pictographs
    (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) || // Supplemental symbols & pictographs
    (codePoint >= 0x1f680 && codePoint <= 0x1f6c5) || // Transport & map
    (codePoint >= 0x2600 && codePoint <= 0x27bf) || // Misc dingbats
    (codePoint >= 0x1fa70 && codePoint <= 0x1faff) // Symbols & pictographs extended-A
  );
};

const getTypingDelayForChar = (char: string, baseDelay: number): number => {
  const base = Math.max(18, baseDelay);
  if (!char) return base;

  if (char === "\n") {
    return base * 2.3;
  }

  if (isEmojiChar(char)) {
    return base * 2.5;
  }

  if (".!?".includes(char)) {
    return base * 2.6;
  }

  if (",;:".includes(char)) {
    return base * 1.4;
  }

  if (char === " ") {
    return base * 1.1;
  }

  if (char === "-") {
    return base * 1.18;
  }

  return base;
};

const estimateSpeechDurationMs = (text: string): number => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 0;
  const wordsPerMinute = 225;
  const minutes = words / wordsPerMinute;
  return minutes * 60 * 1000;
};

const computeBaseTypingDelay = (text: string, actualDurationMs?: number) => {
  const durationMs =
    typeof actualDurationMs === "number" && actualDurationMs > 0
      ? actualDurationMs
      : estimateSpeechDurationMs(text);
  if (!durationMs) return 26;
  const perChar = durationMs / Math.max(text.length, 1);
  const adjusted = perChar * 0.68 + 10;
  return Math.min(70, Math.max(18, adjusted));
};

type Provider = "openai" | "claude";

type Message = {
  role: "user" | "assistant";
  content: string;
  provider?: Provider; // set for assistant messages
};

type ContentDoc = {
  name: string;
  text: string;
};

type BoardDoc = {
  id: string;
  name: string;
  text: string;
};

type BoardDocInput = {
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

type SavedChat = {
  id: string;
  title: string;
  savedAt: number;
  messages: Message[];
};

const generateId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export default function Home() {
  const [showOrb, setShowOrb] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingTranscript, setPendingTranscript] = useState("");

  // ElevenLabs Voice
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ✅ OpenAI is default brain
  const [provider, setProvider] = useState<Provider>("openai");

  // Voice mute
  const [isMuted, setIsMuted] = useState(false);

  // Content onboarding state
  const [contentLinks, setContentLinks] = useState<string[]>([]);
  const [linkInput, setLinkInput] = useState("");

  // Text docs state
  const [contentDocs, setContentDocs] = useState<ContentDoc[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);
  const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
  const [selectedSavedChatId, setSelectedSavedChatId] = useState<string | null>(
    null
  );
  const providerRef = useRef<Provider>("openai");
  const messagesRef = useRef<Message[]>([]);
  const contentLinksRef = useRef<string[]>([]);
  const contentDocsRef = useRef<ContentDoc[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isMutedRef = useRef(false);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const typingControllerRef = useRef<{ cancel: () => void } | null>(null);

  // Scroll container ref
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  // Single chosen voice for Poppy
  const [poppyVoice, setPoppyVoice] = useState<SpeechSynthesisVoice | null>(
    null
  );

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("poppyBoards");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Board[];
        setBoards(parsed);
        if (parsed.length > 0) {
          setSelectedBoardIds([parsed[0].id]);
        }
      } catch (err) {
        console.warn("Failed to parse stored boards", err);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedChats = window.localStorage.getItem("poppySavedChats");
    if (storedChats) {
      try {
        const parsed = JSON.parse(storedChats) as SavedChat[];
        if (Array.isArray(parsed)) {
          setSavedChats(parsed);
        }
      } catch (err) {
        console.warn("Failed to parse saved chats", err);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("poppyBoards", JSON.stringify(boards));
  }, [boards]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("poppySavedChats", JSON.stringify(savedChats));
  }, [savedChats]);

  // 🧠 Setup SpeechRecognition on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    // @ts-ignore - Web Speech API types aren't built-in everywhere
    const SpeechRecognition =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("SpeechRecognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true; // let it keep listening
    recognition.interimResults = false; // we only care about final chunks

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Build up the full utterance over multiple results
      let fullText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        fullText += event.results[i][0].transcript + " ";
      }
      fullText = fullText.trim();
      console.log("🎙 accumulated transcript chunk:", fullText);

      if (!fullText) return;

      // Append this chunk to the pending transcript
      setPendingTranscript((prev) => (prev ? `${prev} ${fullText}` : fullText));
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, []);

  // 🎙 Pick a stable voice for Poppy once voices are available
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;

      // Try to find a nice female-ish English voice
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

  // 🔊 Text-to-speech for Poppy's replies
  const speak = async (
    text: string,
    onPlaybackStart?: (info: {
      durationMs?: number;
      audio?: HTMLAudioElement;
    }) => void
  ): Promise<number | undefined> => {
    const notifyPlaybackStart = (info?: {
      durationMs?: number;
      audio?: HTMLAudioElement;
    }) => {
      try {
        onPlaybackStart?.(info ?? {});
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
      // Call your ElevenLabs TTS route
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
    const text = fullText || "";

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

  // 🛰 Send history + provider + content links + docs to /api/poppy-chat
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
      void typeOutAssistantReply(intro, "claude");
    }
  };

  // Orb = mic button now
  const handleToggleListening = () => {
    if (isSpeaking && !isListening) {
      stopSpeakingAndRevealText();
      return;
    }

    if (!recognitionRef.current) {
      alert(
        "Your browser doesn’t support voice input. Try Chrome for the full experience."
      );
      return;
    }

    if (isListening) {
      // 👉 User is DONE talking: stop and send the turn
      recognitionRef.current.stop();
      setIsListening(false);

      const finalText = pendingTranscript.trim();
      if (finalText) {
        const currentProvider = providerRef.current;
        const updated: Message[] = [
          ...messagesRef.current,
          { role: "user", content: finalText },
        ];

        setMessages(updated);
        setPendingTranscript("");
        setIsThinking(true);

        // Use ALL current links + docs + full history
        const linksForChat =
          selectedBoards.length > 0
            ? Array.from(
                new Set(
                  selectedBoards.flatMap((board) => board.links ?? [])
                )
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
      // 👉 User is STARTING a new voice turn
      if (typeof window !== "undefined") {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      setPendingTranscript(""); // clear previous draft

      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  // 🔀 Switch brain without wiping conversation
  const handleSetProvider = (nextProvider: Provider) => {
    if (nextProvider === provider) return;
    setProvider(nextProvider);
  };

  // 🔊 Toggle mute (pause/resume current utterance)
  const handleToggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const synth = window.speechSynthesis;

        if (next) {
          // 👉 going INTO muted state: just pause current speech
          synth.pause();
        } else {
          // 👉 leaving muted state: resume if there's something to resume
          if (currentUtteranceRef.current) {
            synth.resume();
          }
        }
      }

      return next;
    });
  };

  // 🧷 Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // 📄 Handle text file uploads
  const handleFileUpload = (e: any) => {
    const files = e.target.files as FileList | null;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        if (!text.trim()) return;

        setContentDocs((prev) => [
          ...prev,
          {
            name: file.name,
            text,
          },
        ]);
      };
      reader.readAsText(file);
    });

    // reset input so same file can be re-selected if needed
    e.target.value = "";
  };

  const selectedBoards = selectedBoardIds
    .map((id) => boards.find((b) => b.id === id) || null)
    .filter((b): b is Board => b !== null);
  const selectedBoard = selectedBoards[0] ?? null;
  const canSaveCurrentBoard =
    selectedBoards.length > 0 &&
    (contentLinks.length > 0 || contentDocs.length > 0);

  const updateBoard = (boardId: string, updater: (board: Board) => Board) => {
    setBoards((prev) =>
      prev.map((board) => (board.id === boardId ? updater(board) : board))
    );
  };

  const addLinkToBoard = (boardId: string, rawUrl: string): boolean => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return false;
    try {
      const url = new URL(
        trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
      );
      const asString = url.toString();
      let added = false;
      updateBoard(boardId, (board) => {
        if (board.links.includes(asString)) {
          return board;
        }
        added = true;
        return {
          ...board,
          links: [...board.links, asString],
        };
      });
      return added;
    } catch {
      alert("That doesn't look like a valid URL. Try again?");
      return false;
    }
  };

  const removeLinkFromBoard = (boardId: string, link: string) => {
    updateBoard(boardId, (board) => ({
      ...board,
      links: board.links.filter((l) => l !== link),
    }));
  };

  const removeDocFromBoard = (boardId: string, docId: string) => {
    updateBoard(boardId, (board) => ({
      ...board,
      docs: board.docs.filter((doc) => doc.id !== docId),
    }));
  };

  const attachDocsToBoard = (boardId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

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
    setSelectedBoardIds((prev) => {
      if (prev.includes(boardId)) {
        return prev.filter((id) => id !== boardId);
      }
      return [boardId, ...prev];
    });
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
    if (!files || files.length === 0) return [];

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

  const handleCreateBoard = ({
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
    const newBoard: Board = {
      id: generateId(),
      title: trimmedTitle,
      description: description.trim(),
      links: [...links],
      docs: docs.map((doc) => ({
        id: generateId(),
        name: doc.name,
        text: doc.text,
      })),
    };
    setBoards((prev) => [newBoard, ...prev]);
    setSelectedBoardIds((prev) => [newBoard.id, ...prev.filter((id) => id !== newBoard.id)]);
  };

  const handleDeleteBoard = (boardId: string) => {
    setBoards((prev) => {
      const next = prev.filter((b) => b.id !== boardId);
      setSelectedBoardIds((current) => {
        const filtered = current.filter((id) => id !== boardId);
        if (filtered.length > 0 || next.length === 0) return filtered;
        return next[0] ? [next[0].id] : [];
      });
      return next;
    });
  };

  const handleSaveCurrentChat = () => {
    const currentMessages = messagesRef.current;
    if (!currentMessages.length) return;
    const timestamp = Date.now();
    const firstUserLine =
      currentMessages.find((m) => m.role === "user")?.content.trim() ?? "";
    const preview =
      firstUserLine.length > 40
        ? `${firstUserLine.slice(0, 40)}…`
        : firstUserLine || "Chat notes";
    const newChat: SavedChat = {
      id: generateId(),
      title: preview || `Chat ${new Date(timestamp).toLocaleString()}`,
      savedAt: timestamp,
      messages: currentMessages.map((m) => ({ ...m })),
    };
    setSavedChats((prev) => [newChat, ...prev]);
    setSelectedSavedChatId(newChat.id);
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
    setBoards((prev) =>
      prev.map((board) =>
        selectedBoardIds.includes(board.id)
          ? {
              ...board,
              links: nextLinks,
              docs: nextDocs,
            }
          : board
      )
    );
  };

  const handleDeleteSavedChat = (chatId: string) => {
    setSavedChats((prev) => prev.filter((chat) => chat.id !== chatId));
    setSelectedSavedChatId((prev) => (prev === chatId ? null : prev));
  };

  const handleRenameSavedChat = (chatId: string, title: string) => {
    setSavedChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, title } : chat))
    );
  };

  // Handle exporting
  const buildLocalSummary = (): string => {
    const msgs = messagesRef.current;
    if (!msgs.length) {
      return [
        "# Poppy Action Plan",
        "",
        "There isn't any conversation yet, so there's nothing to summarize.",
        "",
        "Start talking to Poppy, then export again to get a step-by-step plan.",
      ].join("\n");
    }

    const userMsgs = msgs.filter((m) => m.role === "user");
    const assistantMsgs = msgs.filter((m) => m.role === "assistant");

    const firstUser = userMsgs[0]?.content.trim() ?? "";
    const lastUser =
      userMsgs.length > 0
        ? userMsgs[userMsgs.length - 1].content.trim()
        : firstUser;

    const truncate = (text: string, max: number) =>
      text.length > max ? text.slice(0, max) + "..." : text;

    // Try to find the last assistant message that looks like it contains hooks/titles
    const hookSource = [...assistantMsgs]
      .reverse()
      .find((m) => /hook\s*1/i.test(m.content) || /title\s*1/i.test(m.content));

    // If we find hooks in the text, we’ll keep them exactly as Poppy wrote them
    const hookSection = hookSource
      ? [
          "# Hook + title ideas from this session",
          "",
          hookSource.content.trim(),
        ].join("\n")
      : "";

    const highLevelGoal =
      lastUser ||
      firstUser ||
      "You had a conversation with Poppy about your content and next steps.";

    // This is a generic but actually useful content playbook based on your convo:
    const actionPlanLines = [
      "# High-level goal",
      truncate(highLevelGoal, 400),
      "",
      "# Action plan (step-by-step)",
      "",
      "1. **Clarify your primary focus.**",
      "   In this session, your priority was to improve **YouTube hooks and titles** so your views better match your 1.59M subscribers.",
      "",
      "2. **Gather and organize your reference content.**",
      "   - Your old viral videos (4M–6M+ views) – these show what your audience *already proved* they love.",
      "   - Your brand voice document – this keeps everything in your “expert but not elitist” tone.",
      "   - 1–2 favorite creators (like Marco) – good for studying pacing, energy, and hook style.",
      "",
      "3. **Analyze what made the bangers work.**",
      "   - Note what types of stories hit (restorations, customs, grails, transformations).",
      "   - Look at thumbnails: composition, text, colors, how “trashed vs restored” is shown.",
      "   - Pay attention to the *first 5–10 seconds* of those videos: what’s the promise, the tension, the payoff?",
      "",
      "4. **Use Poppy to generate new hooks & titles based on those patterns.**",
      "   - Tell Poppy which video or concept you’re working on (e.g. “destroyed Chicago 1s restoration”).",
      "   - Ask for multiple hook + title options in the style of your best performing videos.",
      "   - Refine: keep the ones that feel most like you and most clickable, and discard the rest.",
      "",
      "5. **Turn hooks into actual videos.**",
      "   - Pick 1–3 hooks/titles from this session’s suggestions (see below if present).",
      "   - Build your thumbnail and intro *around* that hook (don’t bury the best part in the middle).",
      "   - Make sure the video actually delivers on the promise in the title/thumbnail (no fake outs).",
      "",
      "6. **Test, measure, and iterate.**",
      "   - Release a small batch (e.g. 3–5 videos) with strong, distinct hooks.",
      "   - Watch CTR, average view duration, and how they compare to your more recent 10k-view uploads.",
      "   - Come back to Poppy with results so she can help you refine the next batch.",
      "",
      "# Next 3 moves",
      "1. Choose *one* upcoming video concept (a specific shoe / restoration / story) to focus on.",
      "2. Ask Poppy for 5–10 hook + title options for that exact video, based on your old viral style.",
      "3. Pick the strongest hook, film that video next, and use Poppy again to improve the next one based on performance.",
    ];

    const parts = [actionPlanLines.join("\n")];

    if (hookSection) {
      parts.push("", hookSection);
    }

    // Note: we intentionally DO NOT add a full conversation snapshot anymore
    // to avoid just duplicating the chat.

    return parts.join("\n");
  };

  const handleExportTextFile = () => {
    const summary = buildLocalSummary();

    const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "poppy-action-plan.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportGoogleDoc = async () => {
    const summary = buildLocalSummary();

    try {
      const res = await fetch("/api/export-google-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Poppy Action Plan",
          content: summary,
        }),
      });

      if (!res.ok) {
        alert("Could not export to Google Docs 😭");
        return;
      }

      const data = await res.json();
      if (data.docUrl) {
        window.open(data.docUrl, "_blank");
      } else {
        alert("Exported, but I couldn't find the doc URL.");
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong talking to the export API.");
    }
  };

  const handleExportGoogleDocViaMcp = async () => {
    const summary = await buildLocalSummary();
    if (!summary) {
      alert("I couldn't generate a summary to export 😭");
      return;
    }

    try {
      const res = await fetch("/api/export-google-doc-mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Poppy Action Plan (MCP)",
          content: summary,
        }),
      });

      if (!res.ok) {
        alert("Could not export to Google Docs via MCP 😭");
        return;
      }

      const data = await res.json();
      if (data.docUrl) {
        window.open(data.docUrl, "_blank");
      } else {
        alert("Exported via MCP, but I couldn't find the doc URL.");
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong talking to the MCP export API.");
    }
  };

  const showPendingTranscript = isListening && !!pendingTranscript;

  return (
    <main
      className={`relative min-h-screen bg-[#0D0D0D] text-[#F2E8DC] flex flex-col items-center px-4 ${
        showOrb ? "justify-start pt-12 pb-12" : "justify-center"
      }`}
    >
      {/* 🧠 Brain toggle + Mute in top-right */}
      {showOrb && (
        <TopControls
          provider={provider}
          isMuted={isMuted}
          onProviderChange={handleSetProvider}
          onToggleMute={handleToggleMute}
          onExportText={handleExportTextFile}
          onExportGoogleDoc={handleExportGoogleDoc}
          onExportGoogleDocViaMcp={handleExportGoogleDocViaMcp}
        />
      )}

      {!showOrb ? (
        <PoppyHero onStartExperience={handleStartExperience} />
      ) : (
        <>
          {/* Center column: orb + transcript + chat */}
          <div className="flex flex-col items-center w-full max-w-2xl gap-4 md:gap-6">
            <OrbVisualizer
              orbState={orbState}
              auraStyle={auraStyle}
              innerOrbStyle={innerOrbStyle}
              pendingTranscript={pendingTranscript}
              showPendingTranscript={showPendingTranscript}
              isListening={isListening}
              onToggleListening={handleToggleListening}
              orbCanvasRef={orbCanvasRef}
              poppyImageRef={poppyImageRef}
            />

            <ChatTranscript
              messages={messages}
              messagesContainerRef={messagesContainerRef}
            />
          </div>

          <div className="w-full max-w-2xl mt-4 md:mt-0 md:absolute md:left-4 md:top-28 md:w-80">
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
          </div>
          <div className="w-full max-w-2xl mt-4 md:mt-0 md:absolute md:right-4 md:top-28 md:w-80">
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
          </div>
        </>
      )}
    </main>
  );
}
