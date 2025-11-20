"use client";

import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../types";

type ChatTranscriptProps = {
  messages: Message[];
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
};

export default function ChatTranscript({
  messages,
  messagesContainerRef,
}: ChatTranscriptProps) {
  return (
    <div
      ref={messagesContainerRef}
      className="w-full max-h-[55vh] overflow-y-auto mt-2 md:mt-4 space-y-3 text-sm md:text-base bg-[#150140]/40 rounded-2xl p-3 border border-[#7E84F2]/20"
    >
      {messages.map((m, i) => {
        const isUser = m.role === "user";
        const isClaude = m.provider === "claude";
        const isOpenAI = m.provider === "openai";

        const assistantBubbleClasses = "bg-[#7E84F2] text-[#0D0D0D]";
        const iconBgClasses = "bg-[#7E84F2]";

        return (
          <div
            key={i}
            className={`flex ${
              isUser ? "justify-end" : "justify-start"
            } items-start gap-2`}
          >
            {!isUser && (
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 overflow-hidden ${iconBgClasses}`}
              >
                {isClaude && (
                  <Image
                    src="/icons/claude.svg"
                    alt="Claude"
                    width={20}
                    height={20}
                    className="w-5 h-5 object-contain"
                  />
                )}
                {isOpenAI && (
                  <Image
                    src="/icons/openai.svg"
                    alt="ChatGPT"
                    width={20}
                    height={20}
                    className="w-5 h-5 object-contain"
                  />
                )}
                {!m.provider && (
                  <span className="text-[9px] uppercase tracking-wide text-[#0D0D0D]">
                    P
                  </span>
                )}
              </div>
            )}

            <div
              className={`px-3 py-2 rounded-2xl max-w-[80%] ${
                isUser
                  ? "bg-[#F2E8DC] text-[#0D0D0D] rounded-br-sm"
                  : `${assistantBubbleClasses} rounded-bl-sm`
              }`}
            >
              {isUser ? (
                <span>{m.content}</span>
              ) : (
                <div
                  className="
                    text-sm md:text-base leading-relaxed space-y-1
                    [&_strong]:font-semibold
                    [&_em]:italic
                    [&_ul]:list-disc [&_ul]:pl-4
                    [&_ol]:list-decimal [&_ol]:pl-4
                    [&_li]:my-0.5
                    [&_code]:font-mono [&_code]:text-xs
                    [&_pre]:bg-black/20 [&_pre]:rounded-lg [&_pre]:p-2 [&_pre]:overflow-x-auto
                  "
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
