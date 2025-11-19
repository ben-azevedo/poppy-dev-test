"use client";

import Image from "next/image";

type PoppyHeroProps = {
  onStartExperience: () => void;
};

export default function PoppyHero({ onStartExperience }: PoppyHeroProps) {
  return (
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
        Click below to drop into a voice-only session where Poppy helps you turn
        your existing content into a content engine.
      </p>
      <button
        onClick={onStartExperience}
        className="mt-4 px-8 py-3 rounded-full bg-[#F27979] hover:bg-[#F2A0A0] text-[#0D0D0D] font-semibold text-lg shadow-[0_0_25px_rgba(242,121,121,0.7)] transition-transform hover:scale-105"
      >
        Get Started
      </button>
    </div>
  );
}
