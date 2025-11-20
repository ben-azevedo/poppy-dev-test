"use client";

import { useState, ChangeEvent } from "react";
import type { Board, SavedChat } from "../../types";

type BoardsPanelProps = {
  className?: string;
  boards: Board[];
  selectedBoardIds: string[];
  getLinkDisplayLabel: (url: string) => string;
  onToggleBoard: (boardId: string) => void;
  onUpdateBoard: (boardId: string, updater: (board: Board) => Board) => void;
  onDeleteBoard: (boardId: string) => void;
  onAttachDocs: (boardId: string, files: FileList | null) => void;
  savedChats: SavedChat[];
  selectedSavedChatId: string | null;
  canSaveChat: boolean;
  onSaveChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, title: string) => void;
};

export default function BoardsPanel({
  className = "",
  boards,
  selectedBoardIds,
  getLinkDisplayLabel,
  onToggleBoard,
  onUpdateBoard,
  onDeleteBoard,
  onAttachDocs,
  savedChats,
  selectedSavedChatId,
  canSaveChat,
  onSaveChat,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
}: BoardsPanelProps) {
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingBoardTitle, setEditingBoardTitle] = useState("");
  const [editingBoardLinkInput, setEditingBoardLinkInput] = useState("");
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatTitle, setEditingChatTitle] = useState("");

  const startEditingBoard = (board: Board) => {
    setEditingBoardId(board.id);
    setEditingBoardTitle(board.title);
    setEditingBoardLinkInput("");
  };

  const cancelEditingBoard = () => {
    setEditingBoardId(null);
    setEditingBoardTitle("");
    setEditingBoardLinkInput("");
  };

  const saveEditingBoardTitle = () => {
    if (!editingBoardId) return;
    const trimmed = editingBoardTitle.trim();
    if (!trimmed) {
      alert("Give this board a title before saving.");
      return;
    }
    onUpdateBoard(editingBoardId, (board) => ({ ...board, title: trimmed }));
    cancelEditingBoard();
  };

  const addLinkToBoard = (boardId: string, rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return false;
    try {
      const url = new URL(
        trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
      );
      const asString = url.toString();
      let added = false;
      onUpdateBoard(boardId, (board) => {
        if (board.links.includes(asString)) {
          return board;
        }
        added = true;
        return { ...board, links: [...board.links, asString] };
      });
      return added;
    } catch {
      alert("That doesn't look like a valid URL. Try again?");
      return false;
    }
  };

  const removeLinkFromBoard = (boardId: string, link: string) => {
    onUpdateBoard(boardId, (board) => ({
      ...board,
      links: board.links.filter((l) => l !== link),
    }));
  };

  const removeDocFromBoard = (boardId: string, docId: string) => {
    onUpdateBoard(boardId, (board) => ({
      ...board,
      docs: board.docs.filter((doc) => doc.id !== docId),
    }));
  };

  const handleAttachDocs = (
    boardId: string,
    e: ChangeEvent<HTMLInputElement>
  ) => {
    onAttachDocs(boardId, e.target.files);
    e.target.value = "";
  };

  const startEditingChat = (chat: SavedChat) => {
    setEditingChatId(chat.id);
    setEditingChatTitle(chat.title || "");
  };

  const cancelEditingChat = () => {
    setEditingChatId(null);
    setEditingChatTitle("");
  };

  const saveEditingChat = () => {
    if (!editingChatId) return;
    const trimmed = editingChatTitle.trim();
    if (!trimmed) {
      alert("Give this saved chat a short title before saving.");
      return;
    }
    onRenameChat(editingChatId, trimmed);
    cancelEditingChat();
  };

  const renderBoardsList = () => {
    if (boards.length === 0) {
      return (
        <p className="text-[11px] text-[#F2E8DC]/50">
          Create your first board on the right to get started.
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {boards.map((board) => {
          const isSelected = selectedBoardIds.includes(board.id);
          const isEditingThis = editingBoardId === board.id;
          return (
            <div
              key={board.id}
              className={`rounded-2xl border px-3 py-2 transition ${
                isSelected
                  ? "border-[#F27979] bg-[#F27979]/10"
                  : "border-[#7E84F2]/30 hover:border-[#7E84F2]/60"
              }`}
            >
              {isEditingThis ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={editingBoardTitle}
                    onChange={(e) => setEditingBoardTitle(e.target.value)}
                    placeholder="Board title"
                    className="w-full rounded-full px-3 py-2 text-xs md:text-sm bg-[#0D0D0D] border border-[#7E84F2]/40 text-[#F2E8DC] placeholder:text-[#F2E8DC]/40 focus:outline-none focus:border-[#7E84F2]"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={cancelEditingBoard}
                      className="px-3 py-1 rounded-full text-[11px] border border-[#7E84F2]/40 text-[#F2E8DC]/70 hover:border-[#7E84F2]/80"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEditingBoardTitle}
                      className="px-3 py-1 rounded-full text-[11px] font-semibold bg-[#7E84F2] text-[#0D0D0D] hover:bg-[#959AF8]"
                    >
                      Save
                    </button>
                  </div>
                  <div className="space-y-2 rounded-2xl border border-dashed border-[#7E84F2]/40 px-3 py-2 bg-[#0D0D0D]/30">
                    <p className="text-[10px] text-[#F2E8DC]/60">
                      Add or remove board-specific links
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={editingBoardLinkInput}
                        onChange={(e) =>
                          setEditingBoardLinkInput(e.target.value)
                        }
                        placeholder="https://example.com/video"
                        className="flex-1 rounded-full px-3 py-1.5 text-[11px] bg-[#050505] border border-[#7E84F2]/40 text-[#F2E8DC] placeholder:text-[#F2E8DC]/40 focus:outline-none focus:border-[#7E84F2]"
                      />
                      <button
                        onClick={() => {
                          if (
                            editingBoardId &&
                            addLinkToBoard(editingBoardId, editingBoardLinkInput)
                          ) {
                            setEditingBoardLinkInput("");
                          }
                        }}
                        className="rounded-full px-3 py-1.5 text-[11px] bg-[#7E84F2] text-[#0D0D0D] font-semibold hover:bg-[#959AF8]"
                      >
                        Add link
                      </button>
                    </div>
                    {board.links.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {board.links.map((link) => (
                          <span
                            key={link}
                            className="inline-flex items-center gap-1 rounded-full bg-[#050505] border border-[#7E84F2]/40 px-2 py-0.5 text-[10px] text-[#F2E8DC]/80 max-w-[140px] truncate"
                          >
                            {getLinkDisplayLabel(link)}
                            <button
                              onClick={() =>
                                removeLinkFromBoard(board.id, link)
                              }
                              className="text-[#F2E8DC]/60 hover:text-[#F2E8DC]"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-[#F2E8DC]/50">
                        No links yet in this board.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 rounded-2xl border border-dashed border-[#7E84F2]/40 px-3 py-2 bg-[#0D0D0D]/30">
                    <p className="text-[10px] text-[#F2E8DC]/60">
                      Attach or remove board-specific files
                    </p>
                    <input
                      type="file"
                      multiple
                      accept=".txt,.md,.markdown,.csv"
                      onChange={(e) => handleAttachDocs(board.id, e)}
                      className="text-[10px] text-[#F2E8DC]/70 file:mr-2 file:rounded-full file:border-0 file:bg-[#7E84F2] file:px-3 file:py-0.5 file:text-[10px] file:font-semibold file:text-[#0D0D0D] file:hover:bg-[#959AF8] file:cursor-pointer cursor-pointer"
                    />
                    {board.docs.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {board.docs.map((doc) => (
                          <span
                            key={doc.id}
                            className="inline-flex items-center gap-1 rounded-full bg-[#050505] border border-[#7E84F2]/40 px-2 py-0.5 text-[10px] text-[#F2E8DC]/80 max-w-[140px] truncate"
                          >
                            {doc.name}
                            <button
                              onClick={() => removeDocFromBoard(board.id, doc.id)}
                              className="text-[#F2E8DC]/60 hover:text-[#F2E8DC]"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-[#F2E8DC]/50">
                        No files yet in this board.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => onToggleBoard(board.id)}
                    className="text-left w-full"
                  >
                    <p className="text-xs md:text-sm font-semibold text-[#F2E8DC]">
                      {board.title}
                    </p>
                    {board.description && (
                      <p className="text-[11px] text-[#F2E8DC]/60 truncate">
                        {board.description}
                      </p>
                    )}
                    <div className="mt-1 space-y-1">
                      {board.links.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {board.links.slice(0, 3).map((link) => (
                            <span
                              key={link}
                              className="inline-flex items-center gap-1 rounded-full bg-[#150140] border border-[#7E84F2]/40 px-2 py-0.5 text-[10px] text-[#F2E8DC]/80 max-w-[120px] truncate"
                            >
                              {getLinkDisplayLabel(link)}
                            </span>
                          ))}
                          {board.links.length > 3 && (
                            <span className="text-[10px] text-[#F2E8DC]/60">
                              +{board.links.length - 3} more link
                              {board.links.length - 3 === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      )}
                      {board.docs.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {board.docs.slice(0, 3).map((doc) => (
                            <span
                              key={doc.id}
                              className="inline-flex items-center gap-1 rounded-full bg-[#0D0D0D] border border-[#7E84F2]/30 px-2 py-0.5 text-[10px] text-[#F2E8DC]/70 max-w-[120px] truncate"
                            >
                              {doc.name}
                            </span>
                          ))}
                          {board.docs.length > 3 && (
                            <span className="text-[10px] text-[#F2E8DC]/60">
                              +{board.docs.length - 3} more file
                              {board.docs.length - 3 === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-[#F2E8DC]/40 mt-1">
                      {isSelected ? "Selected" : "Tap to select"}
                    </p>
                  </button>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => startEditingBoard(board)}
                      className="text-[11px] text-[#F2E8DC]/70 hover:text-[#F2E8DC]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDeleteBoard(board.id)}
                      className="text-[11px] text-[#F27979] hover:text-[#F2A0A0]"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderSavedChats = () => {
    if (savedChats.length === 0) {
      return (
        <p className="text-[11px] text-[#F2E8DC]/50">
          No saved chats yet. Use the button above after you talk to Poppy.
        </p>
      );
    }

    return (
      <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
        {savedChats.map((chat) => {
          const isSelected = selectedSavedChatId === chat.id;
          const isEditing = editingChatId === chat.id;
          return (
            <div
              key={chat.id}
              className={`rounded-2xl border px-3 py-2 transition ${
                isSelected ? "border-[#F27979]" : "border-[#7E84F2]/30"
              }`}
            >
              {isEditing ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={editingChatTitle}
                    onChange={(e) => setEditingChatTitle(e.target.value)}
                    placeholder="Saved chat title"
                    className="w-full rounded-full px-3 py-2 text-xs md:text-sm bg-[#0D0D0D] border border-[#7E84F2]/40 text-[#F2E8DC] placeholder:text-[#F2E8DC]/40 focus:outline-none focus:border-[#7E84F2]"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={cancelEditingChat}
                      className="px-3 py-1 rounded-full text-[11px] border border-[#7E84F2]/40 text-[#F2E8DC]/70 hover:border-[#7E84F2]/80"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEditingChat}
                      className="px-3 py-1 rounded-full text-[11px] font-semibold bg-[#7E84F2] text-[#0D0D0D] hover:bg-[#959AF8]"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => onSelectChat(chat.id)}
                    className="text-left w-full"
                  >
                    <p className="text-xs md:text-sm font-semibold text-[#F2E8DC] truncate">
                      {chat.title || "Saved chat"}
                    </p>
                    <p className="text-[11px] text-[#F2E8DC]/50">
                      {new Date(chat.savedAt).toLocaleString()}
                    </p>
                  </button>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => startEditingChat(chat)}
                      className="text-[11px] text-[#F2E8DC]/70 hover:text-[#F2E8DC]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDeleteChat(chat.id)}
                      className="text-[11px] text-[#F27979] hover:text-[#F2A0A0]"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className={`bg-[#150140]/40 border border-[#7E84F2]/20 rounded-2xl p-3 md:p-4 space-y-4 ${className}`}
    >
      <div className="space-y-2 border-[#7E84F2]/20">
        <p className="text-[11px] text-[#F2E8DC]/60 uppercase tracking-wide">
          My Boards
        </p>
        {renderBoardsList()}
      </div>

      <div className="space-y-3 border-t border-[#7E84F2]/20 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-[#F2E8DC]/60 uppercase tracking-wide">
            My Chats
          </p>
          <button
            onClick={onSaveChat}
            disabled={!canSaveChat}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
              canSaveChat
                ? "bg-[#7E84F2] text-[#0D0D0D] hover:bg-[#959AF8]"
                : "bg-[#5f5b73] text-[#aaa] cursor-not-allowed"
            }`}
          >
            Save current chat
          </button>
        </div>
        {renderSavedChats()}
      </div>
    </div>
  );
}
