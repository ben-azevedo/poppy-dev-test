"use client";

import { ReactNode } from "react";
import TopControls from "./TopControls";
import PoppyHero from "./PoppyHero";
import type { Provider } from "../types";

type HomeMainLayoutProps = {
  showOrb: boolean;
  provider: Provider;
  isMuted: boolean;
  onProviderChange: (provider: Provider) => void;
  onToggleMute: () => void;
  onStartExperience: () => void;
  onExportText: () => void;
  onExportGoogleDoc: () => void;
  onExportGoogleDocViaMcp: () => void;
  orbExperience: ReactNode;
  isPartyMode: boolean;
  onTogglePartyMode: () => void;
};

export default function HomeMainLayout({
  showOrb,
  provider,
  isMuted,
  onProviderChange,
  onToggleMute,
  onStartExperience,
  onExportText,
  onExportGoogleDoc,
  onExportGoogleDocViaMcp,
  orbExperience,
  isPartyMode,
  onTogglePartyMode,
}: HomeMainLayoutProps) {
  return (
    <main
      className={`relative min-h-screen ${
        isPartyMode ? "party-mode-bg" : "bg-[#0D0D0D]"
      } text-[#F2E8DC] flex flex-col items-center px-4 ${
        showOrb ? "justify-start pt-4 pb-12" : "justify-center"
      }`}
    >
      {showOrb && (
        <TopControls
          provider={provider}
          isMuted={isMuted}
          onProviderChange={onProviderChange}
          onToggleMute={onToggleMute}
          onExportText={onExportText}
          onExportGoogleDoc={onExportGoogleDoc}
          onExportGoogleDocViaMcp={onExportGoogleDocViaMcp}
          isPartyMode={isPartyMode}
          onTogglePartyMode={onTogglePartyMode}
        />
      )}

      {!showOrb ? (
        <PoppyHero onStartExperience={onStartExperience} />
      ) : (
        orbExperience
      )}
    </main>
  );
}
