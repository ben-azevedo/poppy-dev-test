"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

export default function Home() {
  const [showOrb, setShowOrb] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingTranscript, setPendingTranscript] = useState("");

  // ElevenLabs Voice
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ✅ Claude is default brain
  const [provider, setProvider] = useState<Provider>("claude");

  // Voice mute
  const [isMuted, setIsMuted] = useState(false);

  // Content onboarding state
  const [contentLinks, setContentLinks] = useState<string[]>([]);
  const [linkInput, setLinkInput] = useState("");

  // Text docs state
  const [contentDocs, setContentDocs] = useState<ContentDoc[]>([]);

  // Refs to avoid stale state in callbacks
  const providerRef = useRef<Provider>("claude");
  const messagesRef = useRef<Message[]>([]);
  const contentLinksRef = useRef<string[]>([]);
  const contentDocsRef = useRef<ContentDoc[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isMutedRef = useRef(false);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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

  // 🔊 Text-to-speech for Poppy's replies
  const speak = async (text: string) => {
    // If we're muted, don't play anything
    if (isMutedRef.current) {
      setIsSpeaking(false);
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    try {
      setIsSpeaking(true);

      // Call your ElevenLabs TTS route
      const res = await fetch("/api/poppy-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        console.error("TTS request failed", await res.text());
        setIsSpeaking(false);
        return;
      }

      // Get binary audio back from the server
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Stop any previous audio
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      // Play the new clip
      await audio.play();
    } catch (err) {
      console.error("Error playing TTS audio", err);
      setIsSpeaking(false);
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

      const updated: Message[] = [
        ...messagesRef.current,
        {
          role: "assistant",
          content: reply,
          provider: usedProvider, // which LLM answered
        },
      ];
      setMessages(updated);
      speak(reply);
    } catch (err) {
      console.error(err);
      setIsThinking(false);
    }
  };

  const handleStartExperience = () => {
    setShowOrb(true);

    if (messagesRef.current.length === 0) {
      const intro =
        "Hey, I’m Poppy 👋 I’m your AI content buddy. Tell me what kind of content you make, and I’ll help you turn it into banger posts. What platform are you most active on right now?";
      const updated: Message[] = [
        { role: "assistant", content: intro, provider: "claude" }, // default brain
      ];
      setMessages(updated);
      speak(intro);
    }
  };

  // Orb = mic button now
  const handleToggleListening = () => {
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
        void sendToPoppy(
          updated,
          currentProvider,
          contentLinksRef.current,
          contentDocsRef.current
        );
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

  const orbState = isListening
    ? "listening"
    : isSpeaking
    ? "speaking"
    : isThinking
    ? "thinking"
    : "idle";

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

  // 🔧 Reusable side link panel
  const LinkPanel = ({ className = "" }: { className?: string }) => (
    <div
      className={`bg-[#150140]/40 border border-[#7E84F2]/20 rounded-2xl p-3 md:p-4 space-y-4 ${className}`}
    >
      <p className="text-xs md:text-sm text-[#F2E8DC]/80">
        Paste links to your best-performing{" "}
        <strong>ads, sales pages, or videos</strong> (YouTube / Instagram /
        TikTok / etc.).
        <br />
        <br />
        Poppy will study them as your{" "}
        <span className="text-[#F27979] font-semibold">
          source content brain
        </span>{" "}
        so she can mirror the structure and vibe in new hooks, scripts, and
        copy.
      </p>

      {/* Links input */}
      <div className="flex flex-col gap-2">
        <input
          value={linkInput}
          onChange={(e) => setLinkInput(e.target.value)}
          placeholder="https://youtube.com/watch?... or https://www.instagram.com/..."
          className="rounded-full px-3 py-2 text-xs md:text-sm bg-[#0D0D0D] border border-[#7E84F2]/40 text-[#F2E8DC] placeholder:text-[#F2E8DC]/40 focus:outline-none focus:border-[#7E84F2]"
        />
        <button
          onClick={() => {
            const trimmed = linkInput.trim();
            if (!trimmed) return;

            try {
              const url = new URL(
                trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
              );
              const asString = url.toString();
              if (!contentLinksRef.current.includes(asString)) {
                const newLinks = [...contentLinksRef.current, asString];
                setContentLinks(newLinks);
              }
              setLinkInput("");
            } catch {
              alert("That doesn't look like a valid URL. Try again?");
            }
          }}
          className="rounded-full px-4 py-2 bg-[#7E84F2] text-[#0D0D0D] text-xs md:text-sm font-semibold hover:bg-[#959AF8] transition self-start"
        >
          Add link
        </button>
      </div>

      {contentLinks.length > 0 && (
        <div className="mt-1 max-h-32 md:max-h-40 overflow-y-auto">
          <p className="text-[11px] text-[#F2E8DC]/60 mb-1">
            Your content sources:
          </p>
          <div className="flex flex-wrap gap-2">
            {contentLinks.map((link) => (
              <span
                key={link}
                className="inline-flex items-center gap-1 rounded-full bg-[#150140] border border-[#7E84F2]/40 px-3 py-1 text-[11px] text-[#F2E8DC]/80 max-w-full"
              >
                <span className="truncate max-w-[140px] md:max-w-[180px]">
                  {link}
                </span>
                <button
                  onClick={() => {
                    const newLinks = contentLinksRef.current.filter(
                      (l) => l !== link
                    );
                    setContentLinks(newLinks);
                  }}
                  className="text-[#F2E8DC]/50 hover:text-[#F2E8DC]"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Text docs upload */}
      <div className="pt-2 border-t border-[#7E84F2]/20 space-y-2">
        <p className="text-xs md:text-sm text-[#F2E8DC]/80">
          Or drop in <strong>.txt / .md</strong> docs with{" "}
          <strong>pain points, ICP, email copy</strong>, etc. I’ll read them as
          part of your content brain.
        </p>

        <input
          type="file"
          multiple
          accept=".txt,.md,.markdown,.csv"
          onChange={handleFileUpload}
          className="text-[11px] text-[#F2E8DC]/70 file:mr-2 file:rounded-full file:border-0 file:bg-[#7E84F2] file:px-3 file:py-1 file:text-[11px] file:font-semibold file:text-[#0D0D0D] file:hover:bg-[#959AF8] file:cursor-pointer cursor-pointer"
        />

        {contentDocs.length > 0 && (
          <div className="max-h-32 md:max-h-40 overflow-y-auto space-y-1">
            <p className="text-[11px] text-[#F2E8DC]/60 mb-1">Text docs:</p>
            {contentDocs.map((doc, idx) => (
              <div
                key={`${doc.name}-${idx}`}
                className="flex items-center justify-between gap-2 rounded-full bg-[#150140] border border-[#7E84F2]/40 px-3 py-1 text-[11px] text-[#F2E8DC]/80"
              >
                <span className="truncate max-w-[140px] md:max-w-[180px]">
                  {doc.name}
                </span>
                <button
                  onClick={() => {
                    setContentDocs((prev) => prev.filter((_, i) => i !== idx));
                  }}
                  className="text-[#F2E8DC]/50 hover:text-[#F2E8DC]"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

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

  const showPendingTranscript = isListening && !!pendingTranscript;

  return (
    <main
      className={`relative min-h-screen bg-[#0D0D0D] text-[#F2E8DC] flex flex-col items-center px-4 ${
        showOrb ? "justify-start pt-12 pb-12" : "justify-center"
      }`}
    >
      {/* 🧠 Brain toggle + Mute in top-right */}
      {showOrb && (
        <>
          <div className="absolute top-4 left-4 flex items-center gap-3 z-20">
            {/* Mute toggle */}
            {/* <button
              onClick={handleToggleMute}
              className={`rounded-full px-3 py-1 text-xs md:text-sm border transition flex items-center gap-1 ${
                isMuted
                  ? "bg-[#150140] border-[#7E84F2]/70 text-[#F2E8DC]"
                  : "bg-transparent border-[#7E84F2]/40 text-[#F2E8DC]/70"
              }`}
            >
              <span>{isMuted ? "🔇" : "🔊"}</span>
              <span className="hidden md:inline">
                {isMuted ? "Muted" : "Voice on"}
              </span>
            </button> */}

            {/* Brain toggle */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] md:text-xs uppercase tracking-wide text-[#F2E8DC]/60">
                Brain
              </span>
              <div className="flex bg-[#150140] rounded-full p-1 text-xs md:text-sm border border-[#7E84F2]/50">
                {/* ChatGPT button */}
                <button
                  onClick={() => handleSetProvider("openai")}
                  className={`px-3 py-1 rounded-full transition flex items-center gap-1 ${
                    provider === "openai"
                      ? "bg-[#F2E8DC] text-[#0D0D0D]"
                      : "text-[#F2E8DC]/70"
                  }`}
                >
                  <Image
                    src="/icons/openai.svg"
                    alt="ChatGPT"
                    width={16}
                    height={16}
                    className={`w-4 h-4 object-contain ${
                      provider === "openai" ? "" : "invert opacity-70"
                    }`}
                  />
                  <span>{" - ChatGPT"}</span>
                </button>

                {/* Claude button */}
                <button
                  onClick={() => handleSetProvider("claude")}
                  className={`px-3 py-1 rounded-full transition flex items-center gap-1 ${
                    provider === "claude"
                      ? "bg-[#7E84F2] text-[#0D0D0D]"
                      : "text-[#F2E8DC]/70"
                  }`}
                >
                  <Image
                    src="/icons/claude.svg"
                    alt="Claude"
                    width={16}
                    height={16}
                    className={`w-4 h-4 object-contain ${
                      provider === "claude" ? "" : "invert opacity-70"
                    }`}
                  />
                  <span>{" - Claude"}</span>
                </button>
              </div>
            </div>
          </div>
          <div className="absolute top-4 right-4 flex items-center gap-3 z-20">
            {/* Export toggle */}
            <div className="flex items-center gap-2">
              <div className="flex bg-[#150140] rounded-full p-1 text-xs md:text-sm border border-[#7E84F2]/50">
                {/* Google Docs MCP Export button */}
                <button
                  onClick={handleExportGoogleDoc}
                  className="px-3 py-1 rounded-full transition flex items-center gap-1"
                >
                  <span>Google Docs</span>
                </button>
              </div>
              <div className="flex bg-[#150140] rounded-full p-1 text-xs md:text-sm border border-[#7E84F2]/50">
                {/* Text File Export button */}
                <button
                  onClick={handleExportTextFile}
                  className="px-3 py-1 rounded-full transition flex items-center gap-1"
                >
                  <span>Text File</span>
                </button>
              </div>
              <span className="text-[10px] md:text-xs uppercase tracking-wide text-[#F2E8DC]/60">
                Export
              </span>
            </div>
          </div>
        </>
      )}

      {!showOrb ? (
        <div className="flex flex-col items-center text-center gap-6 max-w-md">
          <Image
            src="/icons/poppy.png"
            alt="Poppy"
            width={256}
            height={256}
            className="w-50 h-50 object-contain"
          />
          <h1 className="text-3xl md:text-4xl font-bold">
            Meet{" "}
            <span className="text-[#7E84F2] drop-shadow-[0_0_12px_rgba(126,132,242,0.9)]">
              Poppy
            </span>
            , your AI content buddy ✨
          </h1>
          <p className="text-sm md:text-base text-[#F2E8DC]/80">
            Click below to drop into a voice-only session where Poppy helps you
            turn your existing content into a content engine.
          </p>
          <button
            onClick={handleStartExperience}
            className="mt-4 px-8 py-3 rounded-full bg-[#F27979] hover:bg-[#F2A0A0] text-[#0D0D0D] font-semibold text-lg shadow-[0_0_25px_rgba(242,121,121,0.7)] transition-transform hover:scale-105"
          >
            Get Started
          </button>
        </div>
      ) : (
        <>
          {/* Center column: orb + transcript + chat */}
          <div className="flex flex-col items-center w-full max-w-2xl gap-4 md:gap-6">
            {/* Orb (acts as mic button) */}
            <div
              className="relative w-56 h-56 md:w-80 md:h-80 flex items-center justify-center cursor-pointer"
              onClick={handleToggleListening}
            >
              {/* Outer aura */}
              <div
                className={`
                  absolute inset-0 rounded-full blur-3xl
                  transition-all duration-700
                  ${
                    orbState === "listening"
                      ? "bg-[#7E84F2]/60"
                      : orbState === "speaking"
                      ? "bg-[#F27979]/60"
                      : orbState === "thinking"
                      ? "bg-[#F2E8DC]/40"
                      : "bg-[#7E84F2]/30"
                  }
                `}
              />
              {/* Rotating ring */}
              <div
                className={`
                  absolute inset-4 rounded-full border
                  border-t-[#F2E8DC]/60 border-r-[#7E84F2]/50 border-b-[#F27979]/60 border-l-transparent
                  opacity-70
                  animate-[spin_18s_linear_infinite]
                `}
              />
              {/* Inner orb */}
              <div
                className={`
                  relative rounded-full w-40 h-40 md:w-64 md:h-64
                  flex items-center justify-center
                  border border-[#F2E8DC]/40
                  bg-[radial-gradient(circle_at_25%_20%,#F2E8DC33,transparent_55%),radial-gradient(circle_at_80%_80%,#F2797944,transparent_60%),radial-gradient(circle_at_50%_50%,#150140,#7E84F2)]
                  shadow-[0_0_80px_rgba(126,132,242,0.9)]
                  transition-transform duration-500
                  ${
                    orbState === "listening"
                      ? "scale-110"
                      : orbState === "speaking"
                      ? "scale-105"
                      : orbState === "thinking"
                      ? "scale-[1.03]"
                      : "scale-100"
                  }
                `}
              >
                <span className="text-sm md:text-base font-semibold text-center px-6 text-[#F2E8DC]">
                  {isListening
                    ? "I’m listening… tap when you’re done 🎧"
                    : orbState === "speaking"
                    ? "Talking to you… 🎀"
                    : orbState === "thinking"
                    ? "Let me think… 🧠"
                    : "Tap to talk to me 💬"}
                </span>
              </div>
            </div>

            {/* Live transcript while listening */}
            {showPendingTranscript && (
              <p
                className="
                  mt-2 
                  text-base md:text-lg 
                  text-[#F2E8DC] 
                  font-medium 
                  italic 
                  text-center 
                  max-w-xl
                "
              >
                {pendingTranscript}
              </p>
            )}

            {/* Conversation log */}
            <div
              ref={messagesContainerRef}
              className="w-full max-h-[55vh] overflow-y-auto mt-2 md:mt-4 space-y-3 text-sm md:text-base bg-[#150140]/40 rounded-2xl p-3 border border-[#7E84F2]/20"
            >
              {messages.map((m, i) => {
                const isUser = m.role === "user";
                const isClaude = m.provider === "claude";
                const isOpenAI = m.provider === "openai";

                const assistantBubbleClasses = "bg-[#7E84F2] text-[#0D0D0D]";
                const iconBgClasses = "bg-[#7E84F2]";

                return (
                  <div
                    key={i}
                    className={`flex ${
                      isUser ? "justify-end" : "justify-start"
                    } items-start gap-2`}
                  >
                    {/* Assistant avatar icon on the left */}
                    {!isUser && (
                      <div
                        className={`
                          w-7 h-7 rounded-full flex items-center justify-center
                          shrink-0 overflow-hidden
                          ${iconBgClasses}
                        `}
                      >
                        {isClaude && (
                          <Image
                            src="/icons/claude.svg"
                            alt="Claude"
                            width={20}
                            height={20}
                            className="w-5 h-5 object-contain"
                          />
                        )}
                        {isOpenAI && (
                          <Image
                            src="/icons/openai.svg"
                            alt="ChatGPT"
                            width={20}
                            height={20}
                            className="w-5 h-5 object-contain"
                          />
                        )}
                        {!m.provider && (
                          <span className="text-[9px] uppercase tracking-wide text-[#0D0D0D]">
                            P
                          </span>
                        )}
                      </div>
                    )}

                    {/* Message bubble */}
                    <div
                      className={`px-3 py-2 rounded-2xl max-w-[80%] ${
                        isUser
                          ? "bg-[#F27979] text-[#0D0D0D] rounded-br-sm"
                          : `${assistantBubbleClasses} rounded-bl-sm`
                      }`}
                    >
                      {isUser ? (
                        <span>{m.content}</span>
                      ) : (
                        <div
                          className={`
                            text-sm md:text-base leading-relaxed space-y-1
                            [&_strong]:font-semibold
                            [&_em]:italic
                            [&_ul]:list-disc [&_ul]:pl-4
                            [&_ol]:list-decimal [&_ol]:pl-4
                            [&_li]:my-0.5
                            [&_code]:font-mono [&_code]:text-xs
                            [&_pre]:bg-black/20 [&_pre]:rounded-lg [&_pre]:p-2 [&_pre]:overflow-x-auto
                          `}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {m.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Desktop side panel on the right */}
          <div className="hidden md:block absolute right-4 top-28 w-80">
            <LinkPanel />
          </div>

          {/* Mobile: link panel below the chat */}
          <div className="md:hidden w-full max-w-2xl mt-4">
            <LinkPanel />
          </div>
        </>
      )}
    </main>
  );
}
