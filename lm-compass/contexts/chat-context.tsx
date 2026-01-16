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
  loadMoreMessages as loadMoreMessagesFromStorage,
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
  loadMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;
  isLoadingMore: boolean;
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
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const hasLoadedInitialChat = useRef(false);

  const loadChat = useCallback(
    async (chatIdToLoad: string) => {
      if (!user?.id) {

        return;
      }

      try {

        const { messages: loadedMessages, hasMore, error } = await loadChatFromStorage(
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
          setHasMoreMessages(hasMore);
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
    setHasMoreMessages(false);
    const newChatId = generateChatId();
    setChatId(newChatId);
    // Save new chatId to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("currentChatId", newChatId);
    }
    // Prevent auto-loading after new chat
    hasLoadedInitialChat.current = true;
  }, []);

  const loadMoreMessages = useCallback(async () => {

    if (!user?.id || !chatId || isLoadingMore || !hasMoreMessages) {
      return;
    }

    // Get the sequence order of the first (oldest) message currently loaded
    const oldestMessage = messages[0];
    if (!oldestMessage?.sequenceOrder) {
      // If oldest message doesn't have sequenceOrder, we're at the beginning or messages are new
      setHasMoreMessages(false);
      return;
    }

    // If the oldest message has sequenceOrder 0, we're at the beginning
    if (oldestMessage.sequenceOrder === 0) {
      setHasMoreMessages(false);
      return;
    }

    setIsLoadingMore(true);
    try {
      const { messages: olderMessages, hasMore, error } = await loadMoreMessagesFromStorage(
        supabase,
        chatId,
        user.id,
        oldestMessage.sequenceOrder,
        5
      );

      if (error) {
        console.error("Error loading more messages:", error);
        setHasMoreMessages(false);
        return;
      }

      if (olderMessages && olderMessages.length > 0) {
        setMessages(prev => [...olderMessages, ...prev]);
        setHasMoreMessages(hasMore);
      } else {
        setHasMoreMessages(false);
      }
    } catch (error) {
      console.error("Error loading more messages:", error);
      setHasMoreMessages(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [user?.id, chatId, messages, isLoadingMore, hasMoreMessages, supabase]);

  // Update hasMoreMessages based on current messages state
  useEffect(() => {
    if (messages.length === 0) {
      setHasMoreMessages(false);
      return;
    }

    // Check if any messages don't have sequenceOrder (newly created, not from storage)
    const hasNewMessages = messages.some(msg => msg.sequenceOrder === undefined);
    if (hasNewMessages) {
      // If there are new messages without sequenceOrder, we can't load more from storage
      setHasMoreMessages(false);
      return;
    }

    // Check if the oldest message is at the beginning (sequenceOrder 0)
    const oldestMessage = messages[0];
    if (oldestMessage?.sequenceOrder !== undefined && oldestMessage.sequenceOrder === 0) {
      setHasMoreMessages(false);
      return;
    }
  }, [messages]);

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
        loadMoreMessages,
        hasMoreMessages,
        isLoadingMore,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
