"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Message } from "@/lib/types";
import { useUser } from "@clerk/nextjs";
import { useSupabaseClient } from "@/utils/supabase/client";
import {
  listChats,
  loadChat as loadChatFromStorage,
  type ChatHistoryItem,
} from "@/lib/chat-storage";

// Generate a random chat ID
const generateChatId = () => {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};

// Re-export ChatHistoryItem from storage
export type { ChatHistoryItem } from "@/lib/chat-storage";

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
  const { user } = useUser();
  const supabase = useSupabaseClient();

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setChatStarted(false);
    setChatId(generateChatId());
  }, []);

  const retrieveChatHistory = useCallback(async () => {
    if (!user?.id) {
      setChatHistory([]);
      return;
    }

    try {
      const { chats, error } = await listChats(supabase, user.id);
      if (error) {
        console.error("Error retrieving chat history:", error);
        return;
      }
      setChatHistory(chats);
    } catch (error) {
      console.error("Error retrieving chat history:", error);
    }
  }, [user?.id, supabase]);

  const loadChat = useCallback(
    async (chatIdToLoad: string) => {
      if (!user?.id) {
        return;
      }

      try {
        const { messages: loadedMessages, error } = await loadChatFromStorage(
          supabase,
          chatIdToLoad,
          user.id
        );

        if (error) {
          console.error("Error loading chat:", error);
          return;
        }

        if (loadedMessages) {
          setMessages(loadedMessages);
          setChatId(chatIdToLoad);
          setChatStarted(true);
        }
      } catch (error) {
        console.error("Error loading chat:", error);
      }
    },
    [user?.id, supabase]
  );

  // Fetch chat history on mount and when user changes
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
