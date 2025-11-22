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
import { Compass, BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";

export function AppSidebar() {
  const router = useRouter();

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
              <SidebarMenuButton className="flex items-center gap-2">
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: "h-8 w-8",
                    },
                  }}
                />
                <span className="ml-2">Account</span>
              </SidebarMenuButton>
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
