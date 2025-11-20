"use client";

import { ReactNode } from "react";

type OrbExperienceSectionProps = {
  chatColumn: ReactNode;
  boardsPanel: ReactNode;
  boardFormPanel: ReactNode;
};

export default function OrbExperienceSection({
  chatColumn,
  boardsPanel,
  boardFormPanel,
}: OrbExperienceSectionProps) {
  return (
    <>
      {chatColumn}

      <div className="w-full max-w-2xl mt-4 md:mt-0 md:absolute md:left-4 md:top-28 md:w-80">
        {boardsPanel}
      </div>
      <div className="w-full max-w-2xl mt-4 md:mt-0 md:absolute md:right-4 md:top-28 md:w-80">
        {boardFormPanel}
      </div>
    </>
  );
}
