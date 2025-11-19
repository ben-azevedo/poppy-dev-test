"use client";

import Image from "next/image";

type Provider = "openai" | "claude";

type TopControlsProps = {
  provider: Provider;
  isMuted: boolean;
  onProviderChange: (provider: Provider) => void;
  onToggleMute: () => void;
  onExportText: () => void;
  onExportGoogleDoc: () => void;
  onExportGoogleDocViaMcp: () => void;
};

export default function TopControls({
  provider,
  isMuted,
  onProviderChange,
  onToggleMute,
  onExportText,
  onExportGoogleDoc,
  onExportGoogleDocViaMcp,
}: TopControlsProps) {
  return (
    <>
      <div className="absolute top-4 left-4 flex items-center gap-3 z-20">
        {/* Mute toggle */}
        <button
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
        </button>

        {/* Brain toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] md:text-xs uppercase tracking-wide text-[#F2E8DC]/60">
            Brain
          </span>
          <div className="flex bg-[#150140] rounded-full p-1 text-xs md:text-sm border border-[#7E84F2]/50">
            {/* ChatGPT button */}
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

            {/* Claude button */}
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
      </div>
      <div className="absolute top-4 right-4 flex items-center gap-3 z-20">
        {/* Export buttons */}
        <div className="flex items-center gap-2">
          <div className="flex bg-[#150140] rounded-full p-1 text-xs md:text-sm border border-[#7E84F2]/50">
            {/* Text File Export button */}
            <button
              onClick={onExportText}
              className="px-3 py-1 rounded-full transition flex items-center gap-1"
            >
              <span>Text File</span>
            </button>
          </div>
          <div className="flex bg-[#150140] rounded-full p-1 text-xs md:text-sm border border-[#7E84F2]/50">
            {/* Google Docs Export button */}
            <button
              onClick={onExportGoogleDoc}
              className="px-3 py-1 rounded-full transition flex items-center gap-1"
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
    </>
  );
}
