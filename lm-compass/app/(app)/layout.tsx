import { SidebarProvider } from "@/components/sidebar/sidebar";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { ChatProvider } from "@/contexts/chat-context";
import { OnboardingProvider } from "@/contexts/onboarding-context";
import {
  parseSidebarDefaultOpen,
  SIDEBAR_STATE_COOKIE,
} from "@/lib/sidebar-state";
import { syncUserEmailToDatabase } from "@/lib/sync-user-email";
import { cookies } from "next/headers";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await syncUserEmailToDatabase();

  const cookieStore = await cookies();
  const sidebarFromCookie = parseSidebarDefaultOpen(
    cookieStore.get(SIDEBAR_STATE_COOKIE)?.value
  );
  const sidebarDefaultOpen = sidebarFromCookie ?? true;

  return (
    <ChatProvider>
      <OnboardingProvider>
        <SidebarProvider defaultOpen={sidebarDefaultOpen}>
          <AppSidebar />
          {children}
        </SidebarProvider>
      </OnboardingProvider>
    </ChatProvider>
  );
}
