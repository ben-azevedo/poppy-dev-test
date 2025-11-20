"use client";

import { useState, ChangeEvent } from "react";
import type { BoardDocInput, Board, ContentDoc } from "../../types";

type BoardFormPanelProps = {
  className?: string;
  onCreateBoard: (payload: {
    title: string;
    description: string;
    links: string[];
    docs: BoardDocInput[];
  }) => void;
  onAttachDocs: (files: FileList | null) => Promise<BoardDocInput[]>;
  onSaveSelectedBoard: () => void;
  getLinkDisplayLabel: (url: string) => string;
  contentLinks: string[];
  contentDocs: ContentDoc[];
  selectedBoards: Board[];
  canSaveCurrentBoard: boolean;
};

export default function BoardFormPanel({
  className = "",
  onCreateBoard,
  onAttachDocs,
  onSaveSelectedBoard,
  getLinkDisplayLabel,
  contentLinks,
  contentDocs,
  selectedBoards,
  canSaveCurrentBoard,
}: BoardFormPanelProps) {
  const [boardTitleInput, setBoardTitleInput] = useState("");
  const [boardDescriptionInput, setBoardDescriptionInput] = useState("");
  const [boardLinkInput, setBoardLinkInput] = useState("");
  const [boardFormLinks, setBoardFormLinks] = useState<string[]>([]);
  const [boardFormDocs, setBoardFormDocs] = useState<BoardDocInput[]>([]);

  const canCreateBoard =
    boardTitleInput.trim().length > 0 &&
    (boardFormLinks.length > 0 || boardFormDocs.length > 0);

  const handleAddBoardFormLink = () => {
    const trimmed = boardLinkInput.trim();
    if (!trimmed) return;
    try {
      const url = new URL(
        trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
      );
      const asString = url.toString();
      setBoardFormLinks((prev) =>
        prev.includes(asString) ? prev : [...prev, asString]
      );
      setBoardLinkInput("");
    } catch {
      alert("That doesn't look like a valid URL. Try again?");
    }
  };

  const handleBoardFormDocsUpload = async (
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const docs = await onAttachDocs(e.target.files);
    if (docs.length) {
      setBoardFormDocs((prev) => [...prev, ...docs]);
    }
    e.target.value = "";
  };

  const handleRemoveBoardFormLink = (link: string) => {
    setBoardFormLinks((prev) => prev.filter((l) => l !== link));
  };

  const handleRemoveBoardFormDoc = (index: number) => {
    setBoardFormDocs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = () => {
    onCreateBoard({
      title: boardTitleInput,
      description: boardDescriptionInput,
      links: boardFormLinks,
      docs: boardFormDocs,
    });
    setBoardTitleInput("");
    setBoardDescriptionInput("");
    setBoardLinkInput("");
    setBoardFormLinks([]);
    setBoardFormDocs([]);
  };

  return (
    <div
      className={`bg-[#150140]/40 border border-[#7E84F2]/20 rounded-2xl p-3 md:p-4 space-y-4 ${className}`}
    >
      <div className="space-y-3 border-[#7E84F2]/20">
        <p className="text-xs md:text-sm text-[#F2E8DC]/80">
          Build <strong>Boards</strong> from these assets (title and
          board-specific links/files), then save them for quick recall later.
        </p>

        <p className="text-xs md:text-sm text-[#F2E8DC]/80">
          Poppy will study them as your{" "}
          <span className="text-[#F27979] font-semibold">
            source content brain
          </span>{" "}
          so she can mirror the structure and vibe in new hooks, scripts, and
          copy.
        </p>

        <input
          value={boardTitleInput}
          onChange={(e) => setBoardTitleInput(e.target.value)}
          placeholder="Board title"
          className="w-full rounded-full px-3 py-2 text-xs md:text-sm bg-[#0D0D0D] border border-[#7E84F2]/40 text-[#F2E8DC] placeholder:text-[#F2E8DC]/40 focus:outline-none focus:border-[#7E84F2]"
        />

        {/* <textarea
          value={boardDescriptionInput}
          onChange={(e) => setBoardDescriptionInput(e.target.value)}
          placeholder="Optional description"
          rows={2}
          className="w-full rounded-2xl px-3 py-2 text-xs md:text-sm bg-[#0D0D0D] border border-[#7E84F2]/40 text-[#F2E8DC] placeholder:text-[#F2E8DC]/40 focus:outline-none focus:border-[#7E84F2]"
        /> */}

        <p className="text-xs md:text-sm text-[#F2E8DC]/80">
          Paste links to your best-performing{" "}
          <strong>ads, sales pages, or videos</strong> (YouTube / Instagram /
          TikTok / etc.).
        </p>

        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={boardLinkInput}
              onChange={(e) => setBoardLinkInput(e.target.value)}
              placeholder="Link only for this board"
              className="flex-1 rounded-full px-3 py-2 text-xs md:text-sm bg-[#0D0D0D] border border-[#7E84F2]/40 text-[#F2E8DC] placeholder:text-[#F2E8DC]/40 focus:outline-none focus:border-[#7E84F2]"
            />
            <button
              onClick={handleAddBoardFormLink}
              className="rounded-full px-4 py-2 bg-[#7E84F2] text-[#0D0D0D] text-xs md:text-sm font-semibold hover:bg-[#959AF8] transition"
            >
              Add link
            </button>
          </div>

          {boardFormLinks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {boardFormLinks.map((link) => (
                <span
                  key={link}
                  className="inline-flex items-center gap-1 rounded-full bg-[#150140] border border-[#7E84F2]/40 px-3 py-1 text-[11px] text-[#F2E8DC]/80 max-w-full"
                >
                  <span className="truncate max-w-[140px] md:max-w-[180px]">
                    {getLinkDisplayLabel(link)}
                  </span>
                  <button
                    onClick={() => handleRemoveBoardFormLink(link)}
                    className="text-[#F2E8DC]/50 hover:text-[#F2E8DC]"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs md:text-sm text-[#F2E8DC]/80">
          Or drop in <strong>.txt / .md</strong> docs with{" "}
          <strong>pain points, ICP, email copy</strong>, etc.
        </p>

        <div className="space-y-2">
          <input
            type="file"
            multiple
            accept=".txt,.md,.markdown,.csv"
            onChange={handleBoardFormDocsUpload}
            className="text-[11px] text-[#F2E8DC]/70 file:mr-2 file:rounded-full file:border-0 file:bg-[#7E84F2] file:px-3 file:py-1 file:text-[11px] file:font-semibold file:text-[#0D0D0D] file:hover:bg-[#959AF8] file:cursor-pointer cursor-pointer"
          />
          {boardFormDocs.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {boardFormDocs.map((doc, index) => (
                <div
                  key={`${doc.name}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-full bg-[#150140] border border-[#7E84F2]/40 px-3 py-1 text-[11px] text-[#F2E8DC]/80"
                >
                  <span className="truncate max-w-[140px] md:max-w-[180px]">
                    {doc.name}
                  </span>
                  <button
                    onClick={() => handleRemoveBoardFormDoc(index)}
                    className="text-[#F2E8DC]/50 hover:text-[#F2E8DC]"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs md:text-sm text-[#F2E8DC]/70">
          <strong>
            To create a board, enter a board title and add at least one
            board-specific link or file.
          </strong>
        </p>

        <div className="pt-1 space-y-2">
          <button
            onClick={handleCreate}
            disabled={!canCreateBoard}
            className={`w-full rounded-full px-4 py-2 text-xs md:text-sm font-semibold transition ${
              canCreateBoard
                ? "bg-[#F27979] text-[#0D0D0D] hover:bg-[#f59797]"
                : "bg-[#5f5b73] text-[#aaa] cursor-not-allowed"
            }`}
          >
            Create board
          </button>
        </div>
      </div>
    </div>
  );
}
