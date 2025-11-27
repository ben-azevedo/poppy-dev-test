export type Provider = "openai" | "claude";

export type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  provider?: Provider;
};

export type ContentDoc = {
  name: string;
  text: string;
};

export type BoardDoc = {
  id: string;
  name: string;
  text: string;
};

export type BoardDocInput = {
  name: string;
  text: string;
};

export type Board = {
  id: string;
  title: string;
  description: string;
  links: string[];
  docs: BoardDoc[];
};

export type SavedChat = {
  id: string;
  title: string;
  savedAt: number;
  messages: Message[];
};

