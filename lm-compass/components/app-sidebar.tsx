"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Compass, BookOpen, LogOut, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRouter } from "next/navigation";
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

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center gap-2">
            <Compass className="size-5" />
            <h1 className="text-lg font-bold tracking-tight">LM Compass</h1>
          </div>
          <CustomSidebarTrigger />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <div className="p-4 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Chat History
            </h2>
            <div className="glass-subtle rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground">No chats yet</p>
            </div>
          </div>
        </div>
      </SidebarContent>
      <SidebarFooter>
        <Button
          variant="ghost"
          className="w-full justify-start hover:bg-accent/50"
          onClick={() => router.push("/rubric/view")}
        >
          <BookOpen className="h-4 w-4 mr-2" />
          View Rubrics
        </Button>

        <Separator className="bg-border/50" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SignedIn>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.imageUrl} alt={user?.fullName || "User"} />
                        <AvatarFallback>
                          {user?.firstName?.[0]}{user?.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">
                        {user?.fullName || user?.firstName || "Account"}
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    {user?.fullName || user?.primaryEmailAddress?.emailAddress || "My Account"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-border/50 dark:bg-gray-700" />
                  <SignOutButton>
                    <DropdownMenuItem className="cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </SignOutButton>
                </DropdownMenuContent>
              </DropdownMenu>
            </SignedIn>
            <SignedOut>
              <div className="flex flex-col gap-2 p-2">
                <SignInButton mode="modal">
                  <Button variant="default" className="w-full">
                    Sign In
                  </Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button variant="outline" className="w-full">
                    Sign Up
                  </Button>
                </SignUpButton>
              </div>
            </SignedOut>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
