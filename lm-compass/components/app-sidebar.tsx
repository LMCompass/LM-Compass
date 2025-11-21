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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { User2, ChevronUp, Compass, BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                  <User2 /> Username
                  <ChevronUp className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="w-64">
                <DropdownMenuItem className="py-3 px-4 cursor-pointer">
                  <span>Account</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="py-3 px-4 cursor-pointer">
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
