import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import "./globals.css";

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
    <>
      <html lang="en">
        <head />
        <body className={`${poppins.variable} antialiased font-sans`}>
            <SidebarProvider>
              <AppSidebar />
            {children}
            </SidebarProvider>
        </body>
      </html>
    </>
  );
}
