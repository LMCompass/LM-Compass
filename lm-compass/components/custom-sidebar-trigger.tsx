"use client"

import * as React from "react"
import { Compass, PanelLeft } from "lucide-react"
import { useSidebar } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function CustomSidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar, open } = useSidebar()
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-sidebar="trigger"
          variant="ghost"
          size="icon"
          className={cn("size-7", className)}
          onClick={(event) => {
            onClick?.(event)
            toggleSidebar()
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          {...props}
        >
          {open ? (
            <PanelLeft className="size-5" />
          ) : (
            <>
              <Compass
                className={cn(
                  "size-5 transition-all duration-200 absolute",
                  isHovered ? "opacity-0 scale-75" : "opacity-100 scale-100"
                )}
              />
              <PanelLeft
                className={cn(
                  "size-5 transition-all duration-200 absolute",
                  isHovered ? "opacity-100 scale-100" : "opacity-0 scale-75"
                )}
              />
            </>
          )}
          <span className="sr-only">Toggle Sidebar</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        {open ? "Close Sidebar" : "Open Sidebar"}
      </TooltipContent>
    </Tooltip>
  )
}
