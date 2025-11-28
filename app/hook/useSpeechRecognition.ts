"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseSpeechRecognitionOptions = {
  language?: string;
};

type UseSpeechRecognitionResult = {
  isSupported: boolean;
  isListening: boolean;
  pendingTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
};

export default function useSpeechRecognition({
  language = "en-US",
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionResult {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // @ts-ignore - Web Speech API types aren't built-in everywhere
    const SpeechRecognition =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("SpeechRecognition not supported in this browser.");
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let fullText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        fullText += event.results[i][0].transcript + " ";
      }
      fullText = fullText.trim();
      if (!fullText) return;
      setPendingTranscript((prev) => (prev ? `${prev} ${fullText}` : fullText));
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [language]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err) {
      console.error("Failed to start speech recognition", err);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (err) {
      console.error("Failed to stop speech recognition", err);
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setPendingTranscript("");
  }, []);

  return {
    isSupported,
    isListening,
    pendingTranscript,
    startListening,
    stopListening,
    resetTranscript,
  };
}
