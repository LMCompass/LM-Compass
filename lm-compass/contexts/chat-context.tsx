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
  deleteChat as deleteChatFromStorage,
  updateChatTitle as updateChatTitleInStorage,
  type ChatHistoryItem,
  type ChatMetadata,
} from "@/lib/chat-storage";

const generateChatId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15) +
    Date.now().toString(36)
  );
};

export type { ChatHistoryItem } from "@/lib/chat-storage";

function getModelsUsedInMessages(messages: Message[]): string[] {
  const mostRecentWithResults = messages.findLast(
    (msg) => msg.multiResults && msg.multiResults.length > 0,
  );
  if (!mostRecentWithResults?.multiResults) {
    return [];
  }

  const uniqueModels = new Set<string>();
  for (const r of mostRecentWithResults.multiResults) {
    if (r.model) {
      uniqueModels.add(r.model);
    }
  }

  return Array.from(uniqueModels);
}

type ChatContextType = {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  chatStarted: boolean;
  setChatStarted: React.Dispatch<React.SetStateAction<boolean>>;
  chatId: string;
  chatHistory: ChatHistoryItem[];
  modelsFromLastLoadedChat: string[] | null;
  chatMetadataFromLoadedChat: ChatMetadata | null;
  loadedChatDisplayInfo: {
    models: string[];
    evaluationMethod?: string;
    iterations?: number;
    rubricTitle?: string | null;
  } | null;
  clearModelsFromLastLoadedChat: () => void;
  clearChatMetadataFromLoadedChat: () => void;
  handleNewChat: () => void;
  retrieveChatHistory: () => Promise<void>;
  loadChat: (chatId: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  updateChatTitle: (chatId: string, title: string) => Promise<void>;
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
  const [chatId, setChatId] = useState(() => generateChatId());
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [modelsFromLastLoadedChat, setModelsFromLastLoadedChat] = useState<string[] | null>(null);
  const [chatMetadataFromLoadedChat, setChatMetadataFromLoadedChat] = useState<ChatMetadata | null>(null);
  const [loadedChatDisplayInfo, setLoadedChatDisplayInfo] = useState<{
    models: string[];
    evaluationMethod?: string;
    iterations?: number;
    rubricTitle?: string | null;
  } | null>(null);
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const hasLoadedInitialChat = useRef(false);

  const loadChat = useCallback(
    async (chatIdToLoad: string) => {
      if (!user?.id) {

        return;
      }

      try {
        const { messages: loadedMessages, hasMore, chatMetadata, error } = await loadChatFromStorage(
          supabase,
          chatIdToLoad,
          user.id
        );

        if (error) {
          return;
        }

        if (loadedMessages) {
          setMessages(loadedMessages);
          setHasMoreMessages(hasMore);
          setChatId(chatIdToLoad);
          setChatStarted(true);
          const modelsUsed = getModelsUsedInMessages(loadedMessages);
          setModelsFromLastLoadedChat(modelsUsed.length > 0 ? modelsUsed : null);
          setChatMetadataFromLoadedChat(chatMetadata ?? null);
          setLoadedChatDisplayInfo({
            models: modelsUsed,
            ...(chatMetadata?.evaluationMethod != null && { evaluationMethod: chatMetadata.evaluationMethod }),
            ...(chatMetadata?.iterations != null && { iterations: chatMetadata.iterations }),
            ...(chatMetadata?.rubricTitle != null && { rubricTitle: chatMetadata.rubricTitle }),
          });
          hasLoadedInitialChat.current = true;
        }
      } catch {}
    },
    [user?.id, supabase]
  );

  const clearModelsFromLastLoadedChat = useCallback(() => {
    setModelsFromLastLoadedChat(null);
  }, []);

  const clearChatMetadataFromLoadedChat = useCallback(() => {
    setChatMetadataFromLoadedChat(null);
  }, []);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setChatStarted(false);
    setHasMoreMessages(false);
    setModelsFromLastLoadedChat(null);
    setChatMetadataFromLoadedChat(null);
    setLoadedChatDisplayInfo(null);
    const newChatId = generateChatId();
    setChatId(newChatId);
    hasLoadedInitialChat.current = true;
  }, []);

  const loadMoreMessages = useCallback(async () => {

    if (!user?.id || !chatId || isLoadingMore || !hasMoreMessages) {
      return;
    }

    const oldestMessage = messages[0];
    if (!oldestMessage?.sequenceOrder) {
      setHasMoreMessages(false);
      return;
    }

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
        setHasMoreMessages(false);
        return;
      }

      if (olderMessages && olderMessages.length > 0) {
        setMessages(prev => [...olderMessages, ...prev]);
        setHasMoreMessages(hasMore);
      } else {
        setHasMoreMessages(false);
      }
    } catch {
      setHasMoreMessages(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [user?.id, chatId, messages, isLoadingMore, hasMoreMessages, supabase]);

  useEffect(() => {
    if (messages.length === 0) {
      setHasMoreMessages(false);
      return;
    }

    const hasNewMessages = messages.some(msg => msg.sequenceOrder === undefined);
    if (hasNewMessages) {
      setHasMoreMessages(false);
      return;
    }

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
        return;
      }
      setChatHistory(chats);
      
      hasLoadedInitialChat.current = true;
    } catch {}
  }, [user?.id, supabase]);

  const deleteChat = useCallback(
    async (chatIdToDelete: string) => {
      if (!user?.id) return;
      try {
        const { success, error } = await deleteChatFromStorage(
          supabase,
          chatIdToDelete,
          user.id
        );
        if (error) {
          return;
        }
        if (success) {
          setChatHistory((prev) =>
            prev.filter((c) => c.chatId !== chatIdToDelete)
          );
          if (chatIdToDelete === chatId) {
            handleNewChat();
          }
        }
      } catch {}
    },
    [user?.id, supabase, chatId, handleNewChat]
  );

  const updateChatTitle = useCallback(
    async (chatIdToUpdate: string, title: string) => {
      if (!user?.id) return;
      const trimmed = title.trim();
      if (!trimmed) return;
      try {
        const { success, error } = await updateChatTitleInStorage(
          supabase,
          chatIdToUpdate,
          user.id,
          trimmed
        );
        if (error) {
          return;
        }
        if (success) {
          setChatHistory((prev) =>
            prev.map((c) =>
              c.chatId === chatIdToUpdate ? { ...c, title: trimmed } : c
            )
          );
        }
      } catch {}
    },
    [user?.id, supabase]
  );

  useEffect(() => {
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
        modelsFromLastLoadedChat,
        chatMetadataFromLoadedChat,
        loadedChatDisplayInfo,
        clearModelsFromLastLoadedChat,
        clearChatMetadataFromLoadedChat,
        handleNewChat,
        retrieveChatHistory,
        loadChat,
        deleteChat,
        updateChatTitle,
        loadMoreMessages,
        hasMoreMessages,
        isLoadingMore,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
