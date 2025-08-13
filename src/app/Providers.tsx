"use client";
import ContactModalProvider from "@/components/ContactModalProvider";
import { ThemeProvider } from "next-themes";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ContactModalProvider>{children}</ContactModalProvider>
    </ThemeProvider>
  );
}
