"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Message } from "@/lib/types";

// Generate a random chat ID
const generateChatId = () => {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};

export type ChatHistoryItem = {
  chatId: string;
  title: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type ChatContextType = {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  chatStarted: boolean;
  setChatStarted: React.Dispatch<React.SetStateAction<boolean>>;
  chatId: string;
  chatHistory: ChatHistoryItem[];
  handleNewChat: () => void;
  retrieveChatHistory: () => Promise<void>;
  loadChat: (chatId: string) => Promise<void>;
};

const ChatContext = createContext<ChatContextType | null>(null);

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatStarted, setChatStarted] = useState(false);
  const [chatId, setChatId] = useState(generateChatId());
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setChatStarted(false);
    setChatId(generateChatId());
  }, []);

  // TODO: Implement chat history retrieval from database
  const retrieveChatHistory = useCallback(async () => {
    setChatHistory([]);
  }, []);

  // TODO: Implement load chat functionality
  const loadChat = useCallback(async (chatId: string) => {
    setChatId(chatId);
    setChatStarted(true);
  }, []);

  // Fetch chat history on mount
  useEffect(() => {
    retrieveChatHistory();
  }, [retrieveChatHistory]);

  return (
    <ChatContext.Provider
      value={{
        messages,
        setMessages,
        chatStarted,
        setChatStarted,
        chatId,
        chatHistory,
        handleNewChat,
        retrieveChatHistory,
        loadChat,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
