"use client";

import { CSSProperties, RefObject } from "react";
import OrbVisualizer from "./OrbVisualizer";
import ChatTranscript from "./ChatTranscript";
import type { Message } from "../types";

type ChatColumnProps = {
  orbState: "listening" | "speaking" | "thinking" | "idle";
  auraStyle: CSSProperties;
  innerOrbStyle: CSSProperties;
  pendingTranscript: string;
  showPendingTranscript: boolean;
  isListening: boolean;
  isPartyMode: boolean;
  onToggleListening: () => void;
  orbCanvasRef: RefObject<HTMLCanvasElement>;
  poppyImageRef: RefObject<HTMLDivElement>;
  messages: Message[];
  messagesContainerRef: RefObject<HTMLDivElement | null>;
};

export default function ChatColumn({
  orbState,
  auraStyle,
  innerOrbStyle,
  pendingTranscript,
  showPendingTranscript,
  isListening,
  isPartyMode,
  onToggleListening,
  orbCanvasRef,
  poppyImageRef,
  messages,
  messagesContainerRef,
}: ChatColumnProps) {
  return (
    <div className="flex flex-col items-center w-full max-w-2xl gap-4 md:gap-6">
      <OrbVisualizer
        orbState={orbState}
        auraStyle={auraStyle}
        innerOrbStyle={innerOrbStyle}
        pendingTranscript={pendingTranscript}
        showPendingTranscript={showPendingTranscript}
        isListening={isListening}
        isPartyMode={isPartyMode}
        onToggleListening={onToggleListening}
        orbCanvasRef={orbCanvasRef}
        poppyImageRef={poppyImageRef}
      />

      <ChatTranscript
        messages={messages}
        messagesContainerRef={messagesContainerRef}
      />
    </div>
  );
}
