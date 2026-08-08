import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";

import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Web design, engineering & growth`,
    template: `%s — ${SITE_NAME}`,
  },
  description:
    "Lenis Studio builds websites, software, and marketing systems for small businesses.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-dvh flex-col font-sans">
        <header className="mx-auto w-full max-w-3xl px-6 py-6">
          <Link href="/" className="text-sm font-semibold tracking-wide">
            {SITE_NAME}
          </Link>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-6">{children}</main>

        <footer className="mx-auto w-full max-w-3xl px-6 py-10">
          <div className="flex flex-col gap-3 border-t border-neutral-800 pt-6 text-sm text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} {SITE_NAME}
            </p>
            <nav className="flex flex-wrap gap-x-5 gap-y-2">
              <Link href="/privacy" className="hover:text-neutral-200">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-neutral-200">
                Terms
              </Link>
              <Link href="/data-deletion" className="hover:text-neutral-200">
                Data Deletion
              </Link>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="hover:text-neutral-200"
              >
                Contact
              </a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
