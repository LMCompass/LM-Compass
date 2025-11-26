"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, X, MessageCircleWarning } from "lucide-react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { PromptInputAction } from "@/components/ui/prompt-input";

// Add type definitions for Web Speech API
interface Window {
  SpeechRecognition: any;
  webkitSpeechRecognition: any;
}

interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
    length: number;
  };
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

type UseDictationProps = {
  onTranscript: (text: string) => void;
};

export function useDictation({ onTranscript }: UseDictationProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const SILENCE_TIMEOUT = 3000;

  const handleFatalError = (message: string) => {
    setDictationError(message);
    setIsSupported(false);
    localStorage.setItem(
      "dictation-error",
      JSON.stringify({ message, dismissed: false })
    );
  };

  const cleanupDictation = () => {
    setIsListening(false);
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const resetError = () => {
    if (dictationError === "Microphone access denied. Reset permissions and try again.") {
      setIsSupported(true);
      localStorage.removeItem("dictation-error");
      setDictationError(null);
    } else {
      setDictationError(null);
      if (dictationError) {
        localStorage.setItem(
          "dictation-error",
          JSON.stringify({ message: dictationError, dismissed: true })
        );
      }
    }
  };

  const addPunctuation = (text: string): string => {
    const trimmed = text.trim();
    if (!trimmed) return "";

    if (/[.?!]$/.test(trimmed)) return trimmed;

    const questionWords = [
      "who", "what", "where", "when", "why", "how",
      "do", "does", "did", "can", "could", "should", "would", "will",
      "is", "are", "am", "was", "were", "have", "has", "had"
    ];
    const firstWord = trimmed.split(" ")[0].toLowerCase();

    if (questionWords.includes(firstWord)) {
      return `${trimmed}?`;
    }

    return `${trimmed}.`;
  };

  useEffect(() => {
    const hasSupport =
      "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
    setIsSupported(hasSupport);

    const persistedError = localStorage.getItem("dictation-error");
    if (persistedError) {
      try {
        const parsed = JSON.parse(persistedError);
        const message = typeof parsed === "string" ? parsed : parsed.message;
        const dismissed = typeof parsed === "string" ? false : parsed.dismissed;

        setIsSupported(false);
        if (!dismissed) {
          setDictationError(message);
        }
      } catch (e) {
        setIsSupported(false);
        setDictationError(persistedError);
      }
    }
  }, []);

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    cleanupDictation();
  };

  const startListening = () => {
    if (!isSupported) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setDictationError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        const punctuatedTranscript = addPunctuation(finalTranscript);
        onTranscript(punctuatedTranscript);
      }

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      silenceTimerRef.current = setTimeout(() => {
        stopListening();
      }, SILENCE_TIMEOUT);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") {
        handleFatalError("Microphone access denied. Reset permissions and try again.");
      } else if (event.error === "network") {
        handleFatalError("Dictation disabled due to network or browser error.");
      } else if (event.error === "no-speech") {
        return;
      } else {
        setDictationError(`Error: ${event.error}`);
      }
      stopListening();
    };

    recognition.onend = () => {
      cleanupDictation();
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return {
    isListening,
    isSupported,
    dictationError,
    setDictationError,
    toggleListening,
    resetError,
  };
}

type DictationErrorBannerProps = {
  error: string | null;
  onDismiss: () => void;
};

export function DictationErrorBanner({ error, onDismiss }: DictationErrorBannerProps) {
  if (!error) return null;

  return (
    <Item variant="banner" size="sm" asChild>
      <a>
        <ItemMedia>
          <MessageCircleWarning className="size-5" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{error}</ItemTitle>
        </ItemContent>
        <ItemActions>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={onDismiss}
          >
            <X className="size-4" />
          </Button>
        </ItemActions>
      </a>
    </Item>
  );
}

type DictationButtonProps = {
  isListening: boolean;
  isSupported: boolean;
  disabled: boolean;
  onClick: () => void;
  tooltip: string;
};

export function DictationButton({
  isListening,
  isSupported,
  disabled,
  onClick,
  tooltip,
}: DictationButtonProps) {
  return (
    <PromptInputAction tooltip={tooltip}>
      <Button
        variant="ghost"
        size="icon"
        className={`h-10 w-10 rounded-xl ${isListening
          ? "bg-red-100 text-red-600 hover:bg-red-200"
          : "hover:bg-muted"
          }`}
        onClick={onClick}
        disabled={disabled}
      >
        {isListening ? (
          <MicOff className="size-5" />
        ) : (
          <Mic className="size-5" />
        )}
      </Button>
    </PromptInputAction>
  );
}
