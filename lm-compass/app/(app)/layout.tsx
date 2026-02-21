import { SidebarProvider } from "@/components/sidebar/sidebar";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { ChatProvider } from "@/contexts/chat-context";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ChatProvider>
      <SidebarProvider>
        <AppSidebar />
        {children}
      </SidebarProvider>
    </ChatProvider>
  );
}
