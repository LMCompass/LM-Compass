import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ChatProvider } from "@/contexts/chat-context";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { ExperimentsProvider } from "@/contexts/experiments-context";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "LM Compass",
  description: "A peer-review evaluation platform for LLM's and SLM's",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head />
        <body className={`${poppins.variable} antialiased font-sans`}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ChatProvider>
              <ExperimentsProvider>{children}</ExperimentsProvider>
            </ChatProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
