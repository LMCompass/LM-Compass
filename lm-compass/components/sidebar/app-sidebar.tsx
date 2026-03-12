"use client";

import * as React from "react";

import {
  BookOpen,
  CirclePlay,
  ChevronRight,
  Compass,
  FlaskConical,
  History,
  MessageSquarePlus,
  UserPlus,
  LogIn,
  PanelLeft,
  Settings,
  Trash2,
  Pencil,
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
import { Input } from "@/components/ui/input";
import { SettingsDialog } from "@/components/ui/settings-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useChat } from "@/contexts/chat-context";
import { useOnboarding } from "@/contexts/onboarding-context";

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
  const { startTour } = useOnboarding();
  const { handleNewChat, chatHistory, loadChat, deleteChat, updateChatTitle } =
    useChat();
  const { toggleSidebar, state } = useSidebar();
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [editingChatId, setEditingChatId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");
  const [chatIdPendingDelete, setChatIdPendingDelete] = React.useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const userButtonRef = React.useRef<HTMLDivElement>(null);
  const editInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editingChatId !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingChatId]);

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
                <Link href="/" className="flex-1 block">
                  <SidebarMenuButton
                    size="lg"
                    className="w-full data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
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
                </Link>
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
              data-tour-id="nav-to-chat"
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
                    {item.items && item.items.length > 0 ? (
                      <div className="max-h-[min(200px,40vh)] overflow-y-auto">
                        <SidebarMenuSub>
                          {item.items.map((subItem) => (
                            <SidebarMenuSubItem
                              key={subItem.chatId || subItem.title}
                              className="group/item flex items-center gap-0 min-w-0"
                            >
                              {editingChatId === subItem.chatId ? (
                                <div className="flex flex-1 min-w-0 items-center gap-1 px-2 py-1">
                                  <Input
                                    ref={editInputRef}
                                    value={editingTitle}
                                    onChange={(e) =>
                                      setEditingTitle(e.target.value)
                                    }
                                    onBlur={() => {
                                      const trimmed = editingTitle.trim();
                                      if (trimmed) {
                                        updateChatTitle(subItem.chatId, trimmed);
                                      }
                                      setEditingChatId(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        const trimmed = editingTitle.trim();
                                        if (trimmed) {
                                          updateChatTitle(
                                            subItem.chatId,
                                            trimmed
                                          );
                                        }
                                        setEditingChatId(null);
                                      } else if (e.key === "Escape") {
                                        setEditingChatId(null);
                                        setEditingTitle(
                                          subItem.title ||
                                            `Chat ${subItem.chatId.slice(0, 8)}`
                                        );
                                      }
                                    }}
                                    className="h-7 flex-1 min-w-0 text-sm bg-sidebar-accent/50 border-sidebar-border"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                              ) : (
                                <>
                                  <SidebarMenuSubButton
                                    asChild
                                    className="flex-1 min-w-0"
                                  >
                                    <a
                                      href={subItem.url}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        loadChat(subItem.chatId);
                                        router.push("/chat");
                                      }}
                                      className="flex-1 min-w-0"
                                    >
                                      <span className="truncate block">
                                        {subItem.title}
                                      </span>
                                    </a>
                                  </SidebarMenuSubButton>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setEditingChatId(subItem.chatId);
                                      setEditingTitle(
                                        subItem.title ||
                                          `Chat ${subItem.chatId.slice(0, 8)}`
                                      );
                                    }}
                                    aria-label="Edit chat title"
                                    className="shrink-0 p-1.5 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground opacity-0 group-hover/item:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setChatIdPendingDelete(subItem.chatId);
                                      setShowDeleteDialog(true);
                                    }}
                                    aria-label="Delete chat"
                                    className="shrink-0 p-1.5 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground opacity-0 group-hover/item:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </div>
                    ) : (
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            No previous chats
                          </div>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    )}
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            ))}
            <SidebarMenuButton
              className="hover:bg-sidebar-accent/60"
              data-tour-id="nav-to-rubrics"
              onClick={() => router.push("/rubric/view")}
            >
              <BookOpen className="h-4 w-4" />
              View Rubrics
            </SidebarMenuButton>
            <SidebarMenuButton
              className="hover:bg-sidebar-accent/60"
              data-tour-id="nav-to-experiments"
              onClick={() => router.push("/experiments")}
            >
              <FlaskConical className="h-4 w-4" />
              Experiments
            </SidebarMenuButton>
            <SignedIn>
              <SidebarMenuButton
                className="hover:bg-sidebar-accent/60"
                onClick={() => startTour()}
              >
                <CirclePlay className="h-4 w-4" />
                Replay Demo
              </SidebarMenuButton>
            </SignedIn>
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
      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open);
          if (!open) {
            setChatIdPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this chat and its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowDeleteDialog(false);
                setChatIdPendingDelete(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (chatIdPendingDelete) {
                  await deleteChat(chatIdPendingDelete);
                }
                setShowDeleteDialog(false);
                setChatIdPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SidebarRail />
    </Sidebar>
  );
}
