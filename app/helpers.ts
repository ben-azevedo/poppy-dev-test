export const isEmojiChar = (char: string): boolean => {
  if (!char) return false;
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return false;
  return (
    (codePoint >= 0x1f300 && codePoint <= 0x1f6ff) || // Misc symbols + pictographs
    (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) || // Supplemental symbols & pictographs
    (codePoint >= 0x1f680 && codePoint <= 0x1f6c5) || // Transport & map
    (codePoint >= 0x2600 && codePoint <= 0x27bf) || // Misc dingbats
    (codePoint >= 0x1fa70 && codePoint <= 0x1faff) // Symbols & pictographs extended-A
  );
};

export const getTypingDelayForChar = (
  char: string,
  baseDelay: number
): number => {
  const base = Math.max(18, baseDelay);
  if (!char) return base;

  if (char === "\n") {
    return base * 2.3;
  }

  if (isEmojiChar(char)) {
    return base * 2.5;
  }

  if (".!?".includes(char)) {
    return base * 2.6;
  }

  if (",;:".includes(char)) {
    return base * 1.4;
  }

  if (char === " ") {
    return base * 1.1;
  }

  if (char === "-") {
    return base * 1.18;
  }

  return base;
};

export const estimateSpeechDurationMs = (text: string): number => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 0;
  const wordsPerMinute = 225;
  const minutes = words / wordsPerMinute;
  return minutes * 60 * 1000;
};

export const computeBaseTypingDelay = (
  text: string,
  actualDurationMs?: number
) => {
  const durationMs =
    typeof actualDurationMs === "number" && actualDurationMs > 0
      ? actualDurationMs
      : estimateSpeechDurationMs(text);
  if (!durationMs) return 26;
  const perChar = durationMs / Math.max(text.length, 1);
  const adjusted = perChar * 0.68 + 10;
  return Math.min(70, Math.max(18, adjusted));
};

export const generateId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
