"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar"

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <h2 className="px-4 py-2 text-lg font-semibold">Chat History</h2>
      </SidebarHeader>
      <SidebarContent>
        <div className="px-4 py-2 text-sm text-muted-foreground">
          No chats yet
        </div>
      </SidebarContent>
    </Sidebar>
  )
}

