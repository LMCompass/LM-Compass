"use client";

import * as React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggleButton() {
  const { theme, setTheme } = useTheme();

  const isDark = theme === "dark";

  const handleToggle = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <Button variant="outline" size="icon" onClick={handleToggle}>
      <span className="relative flex items-center justify-center w-5 h-5">
        {/* Light Icon */}
        <Sun
          className={`absolute h-5 w-5 transition-all ${
            !isDark ? "scale-100 rotate-0" : "scale-0 rotate-90"
          }`}
        />
        {/* Dark Icon */}
        <Moon
          className={`absolute h-5 w-5 transition-all ${
            isDark ? "scale-100 rotate-0" : "scale-0 rotate-90"
          }`}
        />
      </span>
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
