"use client"

import { Message as MessageType } from "@/lib/types";
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message";
import { Loader } from "@/components/ui/loader";

type MessagesDisplayProps = {
  messages: MessageType[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function MessagesDisplay({ 
  messages, 
  isLoading, 
  messagesEndRef 
}: MessagesDisplayProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p>Start a conversation by typing a message below.</p>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <Message 
              key={message.id} 
              className={`max-w-4xl mx-auto flex ${
                message.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <MessageAvatar
                src={message.role === "user" ? "/user-avatar.png" : "/ai-avatar.png"}
                alt={message.role === "user" ? "User" : "AI Assistant"}
                fallback={message.role === "user" ? "U" : "AI"}
                className="mt-1"
              />
              <MessageContent 
                markdown={message.role === "assistant"}
                className={`max-w-none ${
                  message.role === "user" 
                    ? "bg-orange-500 text-white" 
                    : "bg-gray-300 text-gray-900"
                }`}
              >
                {message.content}
              </MessageContent>
            </Message>
          ))}
          {isLoading && (
            <Message className="max-w-4xl mx-auto flex flex-row">
              <MessageAvatar
                src="/ai-avatar.png"
                alt="AI Assistant"
                fallback="AI"
                className="mt-1"
              />
              <div className="rounded-lg p-2 bg-gray-300 text-gray-900 break-words whitespace-normal">
                <Loader variant="typing" size="md" />
              </div>
            </Message>
          )}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
