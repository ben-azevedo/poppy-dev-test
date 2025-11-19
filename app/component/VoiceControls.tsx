"use client";

import Image from "next/image";
import { CSSProperties, RefObject } from "react";

type VoiceControlsProps = {
  isListening: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  pendingTranscript: string;
  showPendingTranscript: boolean;
  orbState: "listening" | "speaking" | "thinking" | "idle";
  auraStyle: CSSProperties;
  innerOrbStyle: CSSProperties;
  orbCanvasRef: RefObject<HTMLCanvasElement>;
  poppyImageRef: RefObject<HTMLDivElement>;
  onToggleListening: () => void;
};

export default function VoiceControls({
  isListening,
  isSpeaking,
  isThinking,
  pendingTranscript,
  showPendingTranscript,
  orbState,
  auraStyle,
  innerOrbStyle,
  orbCanvasRef,
  poppyImageRef,
  onToggleListening,
}: VoiceControlsProps) {
  return (
    <>
      <div
        className="relative w-52 h-52 md:w-72 md:h-72 flex items-center justify-center cursor-pointer"
        onClick={onToggleListening}
      >
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
          style={auraStyle}
        />
        <div
          className="
            absolute inset-4 rounded-full border
            border-t-[#F2E8DC]/60 border-r-[#7E84F2]/50 border-b-[#F27979]/60 border-l-transparent
            opacity-70
            animate-[spin_18s_linear_infinite]
          "
        />
        <div
          className="
            relative rounded-full w-36 h-36 md:w-60 md:h-60
            flex items-center justify-center
            border
            bg-[radial-gradient(circle_at_25%_20%,#F2E8DC33,transparent_55%),radial-gradient(circle_at_80%_80%,#F2797944,transparent_60%),radial-gradient(circle_at_50%_50%,#150140,#7E84F2)]
            shadow-[0_0_80px_rgba(126,132,242,0.9)]
            transition-transform duration-500
          "
          style={innerOrbStyle}
        >
          <div className="absolute inset-3 md:inset-5 pointer-events-none">
            <canvas
              ref={orbCanvasRef}
              className="w-full h-full mix-blend-screen opacity-100"
            />
          </div>
          <div
            ref={poppyImageRef}
            className="absolute top-1/2 left-1/2 flex items-center justify-center transition-all duration-500 will-change-transform"
            style={{
              opacity: orbState === "speaking" ? 1 : 0.1,
              filter: orbState === "speaking" ? "none" : "grayscale(1)",
              transform:
                orbState === "speaking"
                  ? undefined
                  : "translate(-50%, -50%) scale(0.95)",
            }}
          >
            <Image
              src="/icons/poppy.png"
              alt="Poppy"
              width={160}
              height={160}
              className="w-24 h-24 md:w-36 md:h-36 object-contain"
            />
          </div>
                {(orbState !== "speaking" || isListening) && (
                  <span className="text-sm md:text-base font-semibold text-center px-6 text-[#F2E8DC] relative z-10">
                    {isListening
                      ? "I’m listening… tap when you’re done 🎧"
                      : isThinking
                      ? "Let me think… 🧠"
                      : "Tap to talk to me 💬"}
                  </span>
                )}
              </div>
      </div>

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
    </>
  );
}
