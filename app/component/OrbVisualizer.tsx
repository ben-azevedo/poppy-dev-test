"use client";

import Image from "next/image";
import { CSSProperties, RefObject } from "react";

type OrbVisualizerProps = {
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
};

export default function OrbVisualizer({
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
}: OrbVisualizerProps) {
  return (
    <>
      <div
        className={`relative w-52 h-52 md:w-72 md:h-72 flex items-center justify-center cursor-pointer rounded-full ${
          isPartyMode ? "party-border-glow border border-[#F2E8DC]/50" : ""
        }`}
        onClick={onToggleListening}
      >
        {isPartyMode && (
          <div className="pointer-events-none absolute inset-0 overflow-visible">
            {["#7E84F2", "#F27979", "#F2E8DC"].map((color, index) => (
              <div
                key={color}
                className="absolute h-1.5 w-1.5 rounded-full party-float"
                style={{
                  backgroundColor: color,
                  left: `${25 + index * 20}%`,
                  top: `${15 + index * 25}%`,
                  animationDelay: `${index * 1.2}s`,
                }}
              />
            ))}
          </div>
        )}
        <div
          className={`
            absolute inset-0 rounded-full blur-3xl
            transition-all duration-700
            ${
              isPartyMode
                ? "bg-[conic-gradient(from_0deg,#7E84F2,#F27979,#F2E8DC,#7E84F2)] opacity-80 mix-blend-screen animate-[spin_12s_linear_infinite]"
                : orbState === "listening"
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
          className={`relative rounded-full w-36 h-36 md:w-60 md:h-60 flex items-center justify-center border transition-transform duration-500 ${
            isPartyMode
              ? "bg-[radial-gradient(circle_at_30%_20%,#F2E8DC66,transparent_65%),radial-gradient(circle_at_80%_80%,#F27979AA,transparent_75%),radial-gradient(circle_at_50%_50%,#150140,#7E84F2)] shadow-[0_0_100px_rgba(242,121,121,0.7)] party-orb-pulse"
              : "bg-[radial-gradient(circle_at_25%_20%,#F2E8DC33,transparent_55%),radial-gradient(circle_at_80%_80%,#F2797944,transparent_60%),radial-gradient(circle_at_50%_50%,#150140,#7E84F2)] shadow-[0_0_80px_rgba(126,132,242,0.9)]"
          }`}
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
                : orbState === "thinking"
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
