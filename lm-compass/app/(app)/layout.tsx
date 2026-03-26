import { SidebarProvider } from "@/components/sidebar/sidebar";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { ChatProvider } from "@/contexts/chat-context";
import { OnboardingProvider } from "@/contexts/onboarding-context";
import { syncUserEmailToDatabase } from "@/lib/sync-user-email";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await syncUserEmailToDatabase();

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
