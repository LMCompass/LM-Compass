"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Compass, Menu, X } from "lucide-react";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import Link from "next/link";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl"
    >
      <div
        className={`
          flex items-center justify-between px-5 py-2.5 rounded-full transition-all duration-500
          ${
            scrolled
              ? "bg-background/70 backdrop-blur-2xl border border-border/40 shadow-[0_8px_32px_-8px] shadow-black/10"
              : "bg-transparent"
          }
        `}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex items-center justify-center size-8 rounded-lg bg-primary text-primary-foreground">
            <Compass className="size-4" />
          </div>
          <span className="font-semibold text-sm text-foreground">
            LM Compass
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-7">
          <button
            onClick={() => scrollTo("features")}
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            Features
          </button>
          <button
            onClick={() => scrollTo("how-it-works")}
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            How It Works
          </button>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200">
                Sign In
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link
              href="/chat"
              className="text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              Go to App
            </Link>
          </SignedIn>
          <Link
            href="/chat"
            className="text-[13px] font-medium px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_20px_-4px] hover:shadow-primary/30 transition-all duration-300"
          >
            Get Started
          </Link>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-foreground"
        >
          {mobileOpen ? (
            <X className="size-5" />
          ) : (
            <Menu className="size-5" />
          )}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="mt-2 rounded-2xl bg-background/80 backdrop-blur-2xl border border-border/40 shadow-xl p-5 flex flex-col gap-3 md:hidden"
          >
            <button
              onClick={() => scrollTo("features")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left py-1"
            >
              Features
            </button>
            <button
              onClick={() => scrollTo("how-it-works")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left py-1"
            >
              How It Works
            </button>
            <hr className="border-border/40" />
            <SignedOut>
              <SignInButton mode="modal">
                <button className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left py-1">
                  Sign In
                </button>
              </SignInButton>
            </SignedOut>
            <Link
              href="/chat"
              className="text-sm font-medium px-4 py-2.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-center"
            >
              Get Started
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
