"use client";

import { useTheme as useNextTheme } from "next-themes";
import { useEffect, useState } from "react";

export function useTheme() {
  const { theme, setTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);

  // Only allow "light" or "dark", no "system"
  const currentTheme = theme === "dark" ? "dark" : "light";

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(currentTheme === "dark" ? "light" : "dark");
  };

  return {
    theme: currentTheme,
    toggleTheme,
    mounted,
  };
}
