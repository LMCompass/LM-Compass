"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { Message } from "@/lib/types";
import { useUser } from "@clerk/nextjs";
import { useSupabaseClient } from "@/utils/supabase/client";
import {
  listChats,
  loadChat as loadChatFromStorage,
  type ChatHistoryItem,
} from "@/lib/chat-storage";

// Generate a random chat ID using crypto.randomUUID for better entropy and collision resistance
const generateChatId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers/environments
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15) +
    Date.now().toString(36)
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
  const [chatId, setChatId] = useState(() => {
    // Try to load chatId from localStorage on initial render
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("currentChatId");
      if (saved) return saved;
    }
    return generateChatId();
  });
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const hasLoadedInitialChat = useRef(false);

  const loadChat = useCallback(
    async (chatIdToLoad: string) => {
      if (!user?.id) {
        console.log("Cannot load chat: user not loaded");
        return;
      }

      try {
        console.log("Loading chat:", chatIdToLoad, "for user:", user.id);
        const { messages: loadedMessages, error } = await loadChatFromStorage(
          supabase,
          chatIdToLoad,
          user.id
        );

        if (error) {
          console.error("Error loading chat:", error);
          return;
        }

        console.log("Loaded messages:", loadedMessages?.length || 0);
        if (loadedMessages) {
          setMessages(loadedMessages);
          setChatId(chatIdToLoad);
          setChatStarted(true);
          // Save chatId to localStorage
          if (typeof window !== "undefined") {
            localStorage.setItem("currentChatId", chatIdToLoad);
          }
          // Mark that we've loaded a chat (prevents auto-loading on new chat)
          hasLoadedInitialChat.current = true;
        }
      } catch (error) {
        console.error("Error loading chat:", error);
      }
    },
    [user?.id, supabase]
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setChatStarted(false);
    const newChatId = generateChatId();
    setChatId(newChatId);
    // Save new chatId to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("currentChatId", newChatId);
    }
    // Prevent auto-loading after new chat
    hasLoadedInitialChat.current = true;
  }, []);

  const retrieveChatHistory = useCallback(async () => {
    if (!user?.id) {
      setChatHistory([]);
      return;
    }

    try {
      console.log("Retrieving chat history for user:", user.id);
      const { chats, error } = await listChats(supabase, user.id);
      if (error) {
        console.error("Error retrieving chat history:", error);
        return;
      }
      console.log("Found chats:", chats.length);
      setChatHistory(chats);
      
      // Don't auto-load on initial mount - start with a new chat
      // Users can click on a chat in the sidebar if they want to load it
      hasLoadedInitialChat.current = true;
    } catch (error) {
      console.error("Error retrieving chat history:", error);
    }
  }, [user?.id, supabase, loadChat, messages.length]);

  // Fetch chat history on mount and when user changes
  useEffect(() => {
    // Only retrieve if user is loaded
    if (user) {
      retrieveChatHistory();
    }
  }, [user, retrieveChatHistory]);

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
