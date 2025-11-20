"use client";

import Image from "next/image";
import type { Provider } from "../types";

type TopControlsProps = {
  provider: Provider;
  isMuted: boolean;
  onProviderChange: (provider: Provider) => void;
  onToggleMute: () => void;
  onExportText: () => void;
  onExportGoogleDoc: () => void;
  onExportGoogleDocViaMcp: () => void;
  isPartyMode: boolean;
  onTogglePartyMode: () => void;
};

export default function TopControls({
  provider,
  isMuted,
  onProviderChange,
  onToggleMute,
  onExportText,
  onExportGoogleDoc,
  onExportGoogleDocViaMcp,
  isPartyMode,
  onTogglePartyMode,
}: TopControlsProps) {
  return (
    <div className="w-full px-4 pt-4 md:px-0 md:pt-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <span className="text-[10px] md:text-xs uppercase tracking-wide text-[#F2E8DC]/60">
              Engine
            </span>
            <div className="flex flex-wrap items-center gap-2 rounded-full bg-[#150140] p-1 text-xs md:text-sm border border-[#7E84F2]/50">
              <button
                onClick={() => onProviderChange("openai")}
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

              <button
                onClick={() => onProviderChange("claude")}
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
          <div className="flex flex-wrap items-center gap-2">
            {/* <button
              onClick={onToggleMute}
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
            <button
              onClick={onTogglePartyMode}
              className={`rounded-full px-3 py-1 text-xs md:text-sm border transition flex items-center gap-1 ${
                isPartyMode
                  ? "bg-[#F27979] border-[#F27979]/70 text-[#0D0D0D] party-border-glow animate-[wiggle_3s_ease-in-out_infinite]"
                  : "bg-transparent border-[#F27979]/60 text-[#F2E8DC]/70"
              }`}
            >
              <span>🎉</span>
              <span className="hidden md:inline">
                {isPartyMode ? "Party Mode On" : "Party Mode"}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
          <div className="flex bg-[#150140] rounded-full p-1 text-xs md:text-sm border border-[#7E84F2]/50 flex-1 md:flex-none">
            <button
              onClick={onExportText}
              className="w-full px-3 py-1 rounded-full transition flex items-center gap-1 justify-center"
            >
              <span>Text File</span>
            </button>
          </div>
          <div className="flex bg-[#150140] rounded-full p-1 text-xs md:text-sm border border-[#7E84F2]/50 flex-1 md:flex-none">
            <button
              onClick={onExportGoogleDoc}
              className="w-full px-3 py-1 rounded-full transition flex items-center gap-1 justify-center"
            >
              <Image
                src="/icons/google.svg"
                alt="GoogleDocs"
                width={16}
                height={16}
                className="w-4 h-4 object-contain invert opacity-80"
              />
              <span>{" - Google Docs"}</span>
            </button>
          </div>
          <span className="text-[10px] md:text-xs uppercase tracking-wide text-[#F2E8DC]/60">
            Export
          </span>
        </div>
      </div>
    </div>
  );
}
