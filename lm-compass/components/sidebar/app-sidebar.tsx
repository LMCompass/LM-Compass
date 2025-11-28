"use client";

import * as React from "react";
import {
  BadgeCheck,
  BookOpen,
  ChevronRight,
  CreditCard,
  LogOut,
  ChevronsUpDown,
  Compass,
  User2,
  History,
  MessageSquarePlus,
  UserPlus,
  LogIn,
  PanelLeft,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useRouter } from "next/navigation";
import { useChat } from "@/contexts/chat-context";

import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  SignOutButton,
  useUser,
} from "@clerk/nextjs";

export function AppSidebar() {
  const router = useRouter();
  const { user } = useUser();
  const { handleNewChat, chatHistory, loadChat } = useChat();
  const { toggleSidebar, state } = useSidebar();

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
                router.push("/");
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
                                  router.push("/");
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
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SignedIn>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground py-6">
                    <Avatar
                      className={state === "collapsed" ? "size-4" : "size-6"}
                    >
                      <AvatarImage
                        src={user?.imageUrl}
                        alt={user?.fullName || "User"}
                      />
                      <AvatarFallback>
                        {user?.firstName?.[0]}
                        {user?.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {user?.fullName || "My Account"}
                      </span>
                      <span className="truncate text-xs">
                        {user?.primaryEmailAddress?.emailAddress || ""}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                  side="bottom"
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-sm">
                      <User2 />
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">
                          {user?.fullName || "My Account"}
                        </span>
                        <span className="truncate text-xs">
                          {user?.primaryEmailAddress?.emailAddress || ""}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <SignOutButton>
                    <DropdownMenuItem>
                      <LogOut />
                      Log out
                    </DropdownMenuItem>
                  </SignOutButton>
                </DropdownMenuContent>
              </DropdownMenu>
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
      <SidebarRail />
    </Sidebar>
  );
}
