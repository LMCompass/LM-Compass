"use client";

import React from "react";
import { Compass } from "lucide-react";

export function Footer() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <footer className="border-t border-border/60">
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="size-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                <Compass className="size-3.5" />
              </div>
              <span className="font-semibold text-foreground">LM Compass</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A peer-review evaluation platform for LLMs and SLMs.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-foreground mb-4 uppercase tracking-wider">
              Product
            </h4>
            <ul className="space-y-2.5">
              <li>
                <button
                  onClick={() => scrollTo("features")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  Features
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollTo("how-it-works")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  How It Works
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-foreground mb-4 uppercase tracking-wider">
              Resources
            </h4>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://github.com/LMCompass/LM-Compass"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-foreground mb-4 uppercase tracking-wider">
              Legal
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Rankings and evaluations are experimental and should not be
              considered definitive.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-border/40">
          <p className="text-xs text-muted-foreground text-center">
            &copy; {new Date().getFullYear()} LM Compass &middot; CS 4ZP6
          </p>
        </div>
      </div>
    </footer>
  );
}
