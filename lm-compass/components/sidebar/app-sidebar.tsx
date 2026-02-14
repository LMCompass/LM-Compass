"use client";

import * as React from "react";

import {
  BookOpen,
  ChevronRight,
  Compass,
  FlaskConical,
  History,
  MessageSquarePlus,
  UserPlus,
  LogIn,
  PanelLeft,
  Settings,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "./sidebar";
import { SettingsDialog } from "@/components/ui/settings-dialog";
import { useRouter } from "next/navigation";
import { useChat } from "@/contexts/chat-context";

import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useUser,
} from "@clerk/nextjs";

export function AppSidebar() {
  const router = useRouter();
  const { user } = useUser();
  const { handleNewChat, chatHistory, loadChat } = useChat();
  const { toggleSidebar, state } = useSidebar();
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const userButtonRef = React.useRef<HTMLDivElement>(null);

  const previousChats = [
    {
      title: "Previous Chats",
      url: "#",
      icon: History,
      isActive: chatHistory.length > 0,
      items: chatHistory.map((chat) => ({
        title: chat.title || `Chat ${chat.chatId.slice(0, 8)}`,
        url: `#${chat.chatId}`,
        chatId: chat.chatId,
      })),
    },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {state === "collapsed" ? (
              <SidebarMenuButton
                onClick={toggleSidebar}
                tooltip="Expand Sidebar"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <PanelLeft />
              </SidebarMenuButton>
            ) : (
              <div className="flex items-center gap-1 w-full">
                <SidebarMenuButton
                  size="lg"
                  className="flex-1 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <Compass className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="text-lg truncate font-bold">
                      LM Compass
                    </span>
                  </div>
                </SidebarMenuButton>
                <SidebarMenuButton
                  onClick={toggleSidebar}
                  tooltip="Collapse Sidebar"
                  className="aspect-square w-fit flex-shrink-0 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <PanelLeft />
                </SidebarMenuButton>
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuButton
              className="hover:bg-sidebar-accent/60"
              onClick={() => {
                handleNewChat();
                router.push("/chat");
              }}
            >
              <MessageSquarePlus className="h-4 w-4" />
              New Chat
            </SidebarMenuButton>
            {previousChats.map((item) => (
              <Collapsible
                key={item.title}
                asChild
                defaultOpen={item.isActive}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip={item.title}>
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items && item.items.length > 0 ? (
                        item.items.map((subItem) => (
                          <SidebarMenuSubItem
                            key={subItem.chatId || subItem.title}
                          >
                            <SidebarMenuSubButton asChild>
                              <a
                                href={subItem.url}
                                onClick={(e) => {
                                  e.preventDefault();
                                  loadChat(subItem.chatId);
                                  router.push("/chat");
                                }}
                              >
                                <span>{subItem.title}</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))
                      ) : (
                        <SidebarMenuSubItem>
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            No previous chats
                          </div>
                        </SidebarMenuSubItem>
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            ))}
            <SidebarMenuButton
              className="hover:bg-sidebar-accent/60"
              onClick={() => router.push("/rubric/view")}
            >
              <BookOpen className="h-4 w-4" />
              View Rubrics
            </SidebarMenuButton>
            <SidebarMenuButton
              className="hover:bg-sidebar-accent/60"
              onClick={() => router.push("/experiments/upload")}
            >
              <FlaskConical className="h-4 w-4" />
              Experiments
            </SidebarMenuButton>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SignedIn>
              <div
                ref={userButtonRef}
                className="flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-sidebar-accent rounded-md transition-colors"
                onClick={(e) => {
                  // Find the UserButton trigger and click it
                  const button = userButtonRef.current?.querySelector('button');
                  if (button && e.target !== button && !button.contains(e.target as Node)) {
                    button.click();
                  }
                }}
              >
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: state === "collapsed" ? "w-8 h-8" : "w-10 h-10",
                      userButtonPopoverCard: "shadow-lg",
                    },
                  }}
                >
                  <UserButton.MenuItems>
                    <UserButton.Action
                      label="OpenRouter Key"
                      labelIcon={<Settings className="w-4 h-4" />}
                      onClick={() => setIsSettingsOpen(true)}
                    />
                  </UserButton.MenuItems>
                </UserButton>
                {state !== "collapsed" && (
                  <div className="grid flex-1 text-left text-sm leading-tight pointer-events-none">
                    <span className="truncate font-semibold">
                      {user?.fullName || "My Account"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.primaryEmailAddress?.emailAddress || ""}
                    </span>
                  </div>
                )}
              </div>
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <SidebarMenuButton variant="primary">
                  <>
                    <LogIn className="h-4 w-4" />
                    Log In
                  </>
                </SidebarMenuButton>
              </SignInButton>
              <SignUpButton mode="modal">
                <SidebarMenuButton>
                  <>
                    <UserPlus className="h-4 w-4" />
                    Sign Up
                  </>
                </SidebarMenuButton>
              </SignUpButton>
            </SignedOut>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
      <SidebarRail />
    </Sidebar>
  );
}
