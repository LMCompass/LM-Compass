import { SidebarProvider } from "@/components/sidebar/sidebar";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { ChatProvider } from "@/contexts/chat-context";
import { OnboardingProvider } from "@/contexts/onboarding-context";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ChatProvider>
      <OnboardingProvider>
        <SidebarProvider>
          <AppSidebar />
          {children}
        </SidebarProvider>
      </OnboardingProvider>
    </ChatProvider>
  );
}
