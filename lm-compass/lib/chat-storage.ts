import type { Message } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ChatHistoryItem = {
  chatId: string;
  title: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type DatabaseMessage = {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  metadata: {
    isStopped?: boolean;
    multiResults?: { model: string; content: string }[];
    evaluationMetadata?: unknown;
    userSelectedWinner?: string;
  } | null;
  sequence_order: number;
  created_at: string;
};

type DatabaseChat = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Saves a chat and its messages to the database.
 */
export async function saveChat(
  supabase: SupabaseClient,
  chatId: string,
  userId: string,
  messages: Message[],
  title?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('saveChat called:', { chatId, userId, messagesCount: messages.length });
    if (messages.length === 0) {
      console.log('No messages to save, returning early');
      return { success: true };
    }

    // Auto-generate title from first user message if not provided
    let chatTitle = title;
    if (!chatTitle) {
      const firstUserMessage = messages.find((m) => m.role === "user");
      chatTitle = firstUserMessage
        ? firstUserMessage.content.slice(0, 50) +
          (firstUserMessage.content.length > 50 ? "..." : "")
        : "New Chat";
    }

    // Upsert chat record
    console.log('Upserting chat:', { id: chatId, user_id: userId, title: chatTitle });
    const { error: chatError, data: chatData } = await supabase
      .from("chats")
      .upsert(
        {
          id: chatId,
          user_id: userId,
          title: chatTitle,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (chatError) {
      console.error('Error upserting chat:', chatError);
      return { success: false, error: chatError.message };
    }
    console.log('Chat upserted successfully');

    // Delete existing messages for this chat
    const { error: deleteError } = await supabase
      .from("messages")
      .delete()
      .eq("chat_id", chatId);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    // Prepare messages for insertion
    const messagesToInsert = messages.map((msg, index) => {
      const {
        id,
        role,
        content,
        isStopped,
        multiResults,
        evaluationMetadata,
        userSelectedWinner,
      } = msg;

      return {
        id,
        chat_id: chatId,
        role,
        content,
        metadata: {
          ...(isStopped !== undefined && { isStopped }),
          ...(multiResults && { multiResults }),
          ...(evaluationMetadata && { evaluationMetadata }),
          ...(userSelectedWinner && { userSelectedWinner }),
        },
        sequence_order: index,
      };
    });

    // Insert all messages
    console.log('Inserting', messagesToInsert.length, 'messages');
    const { error: messagesError } = await supabase
      .from("messages")
      .insert(messagesToInsert);

    if (messagesError) {
      console.error('Error inserting messages:', messagesError);
      return { success: false, error: messagesError.message };
    }

    console.log('Chat saved successfully!');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Loads a chat and its messages from the database.
 */
export async function loadChat(
  supabase: SupabaseClient,
  chatId: string,
  userId: string
): Promise<{ messages: Message[] | null; error?: string }> {
  try {
    // Verify chat belongs to user
    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("id, user_id")
      .eq("id", chatId)
      .eq("user_id", userId)
      .single();

    if (chatError || !chat) {
      return { messages: null, error: "Chat not found" };
    }

    // Load messages
    const { data: dbMessages, error: messagesError } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("sequence_order", { ascending: true });

    if (messagesError) {
      return { messages: null, error: messagesError.message };
    }

    if (!dbMessages || dbMessages.length === 0) {
      return { messages: [] };
    }

    // Convert database messages to app Message format
    console.log('Loading messages from DB, order:', dbMessages.map((m: DatabaseMessage) => `${m.sequence_order}:${m.role}`).join(', '));
    const messages: Message[] = dbMessages.map((dbMsg: DatabaseMessage) => {
      const { id, role, content, metadata, sequence_order } = dbMsg;
      console.log(`Loading message ${sequence_order}: ${role} - ${content.substring(0, 30)}...`);
      const message: Message = {
        id,
        role: role as "user" | "assistant",
        content,
      };

      if (metadata) {
        if (metadata.isStopped !== undefined) {
          message.isStopped = metadata.isStopped;
        }
        if (metadata.multiResults) {
          message.multiResults = metadata.multiResults;
        }
        if (metadata.evaluationMetadata) {
          message.evaluationMetadata = metadata.evaluationMetadata as Message["evaluationMetadata"];
        }
        if (metadata.userSelectedWinner) {
          message.userSelectedWinner = metadata.userSelectedWinner;
        }
      }

      return message;
    });

    return { messages };
  } catch (error) {
    return {
      messages: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Lists all chats for a user, ordered by most recently updated.
 */
export async function listChats(
  supabase: SupabaseClient,
  userId: string
): Promise<{ chats: ChatHistoryItem[]; error?: string }> {
  try {
    const { data: dbChats, error } = await supabase
      .from("chats")
      .select("id, title, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      return { chats: [], error: error.message };
    }

    if (!dbChats) {
      return { chats: [] };
    }

    const chats: ChatHistoryItem[] = dbChats.map((chat: any) => ({
      chatId: chat.id,
      title: chat.title || "Untitled Chat",
      createdAt: chat.created_at ? new Date(chat.created_at) : undefined,
      updatedAt: chat.updated_at ? new Date(chat.updated_at) : undefined,
    }));

    return { chats };
  } catch (error) {
    return {
      chats: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Deletes a chat and all its messages.
 */
export async function deleteChat(
  supabase: SupabaseClient,
  chatId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify chat belongs to user
    const { data: chat, error: verifyError } = await supabase
      .from("chats")
      .select("id, user_id")
      .eq("id", chatId)
      .eq("user_id", userId)
      .single();

    if (verifyError || !chat) {
      return { success: false, error: "Chat not found" };
    }

    // Delete chat (messages will be cascade deleted)
    const { error: deleteError } = await supabase
      .from("chats")
      .delete()
      .eq("id", chatId);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Updates the title of a chat.
 */
export async function updateChatTitle(
  supabase: SupabaseClient,
  chatId: string,
  userId: string,
  title: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify chat belongs to user
    const { data: chat, error: verifyError } = await supabase
      .from("chats")
      .select("id, user_id")
      .eq("id", chatId)
      .eq("user_id", userId)
      .single();

    if (verifyError || !chat) {
      return { success: false, error: "Chat not found" };
    }

    // Update title
    const { error: updateError } = await supabase
      .from("chats")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", chatId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

