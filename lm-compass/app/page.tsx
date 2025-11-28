"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // temp redirect to a new chat
    const tempChatId = Date.now().toString();
    router.push(`/chat/${tempChatId}`);
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-muted-foreground">Creating new chat...</p>
    </div>
  );
}
