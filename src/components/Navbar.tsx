"use client";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { Sun, Moon, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Container from "./ui/Container";

export default function Navbar() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Use a dedicated id for the mobile dropdown (not the nav itself)
  const mobileMenuId = "mobile-menu";
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Toggle `inert` so links aren’t focusable when the menu is closed
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    if (mobileOpen) {
      el.removeAttribute("inert");
      // optional: remove aria-hidden if you previously added it
      el.removeAttribute("aria-hidden");
    } else {
      el.setAttribute("inert", "");
      // optional (won’t affect focus since `inert` handles it)
      el.setAttribute("aria-hidden", "true");
    }
  }, [mobileOpen]);

  return (
    <nav aria-label="Primary" className="bg-nav text-foreground">
      <Container className="relative">
        {/* Equal-side layout keeps center logo truly centered */}
        <div className="relative flex items-center py-2">
          {/* LEFT CLUSTER */}
          <div className="flex-1 flex items-center gap-2">
            {/* Mobile: menu on the left */}
            <button
              type="button"
              className="md:hidden p-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-controls={mobileMenuId}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? "Close main menu" : "Open main menu"}
              onClick={() => setMobileOpen((o) => !o)}>
              <span className="sr-only">
                {mobileOpen ? "Close main menu" : "Open main menu"}
              </span>
              {mobileOpen ? (
                <X size={22} aria-hidden="true" />
              ) : (
                <Menu size={22} aria-hidden="true" />
              )}
            </button>

            {/* Desktop: left links */}
            <div className="hidden md:flex gap-4">
              <Link href="/projects" className="p-2 tracking-[0.5px] uppercase">
                Projects
              </Link>
              <Link
                href="/publications"
                className="p-2 tracking-[0.5px] uppercase">
                Publications
              </Link>
            </div>
          </div>

          {/* CENTER LOGO */}

          <Link href="/" className="text-lg font-semibold">
            <Image
              src="/assets/logo_sdg.png"
              alt="Sarvian Design Group"
              width={0}
              height={0}
              sizes="130px"
              style={{
                width: "130px",
                height: "auto",
                filter: "var(--logo-filter)",
              }}
              priority
            />
          </Link>

          {/* RIGHT CLUSTER */}
          <div className="flex-1 flex items-center justify-end gap-2">
            {/* Desktop: right links */}
            <div className="hidden md:flex items-center gap-4">
              <Link href="/about" className="p-2 tracking-[0.5px] uppercase">
                About
              </Link>
              <Link href="/services" className="p-2 tracking-[0.5px] uppercase">
                Services
              </Link>
              <Link href="/contact" className="p-2 tracking-[0.5px] uppercase">
                Contact
              </Link>
            </div>

            {/* Theme toggle */}
            <button
              type="button"
              aria-label={
                mounted && resolvedTheme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              onClick={() =>
                mounted && setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-full
                         bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors cursor-pointer">
              {mounted ? (
                resolvedTheme === "dark" ? (
                  <Sun size={18} />
                ) : (
                  <Moon size={18} />
                )
              ) : (
                <span className="block h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        <div
          id={mobileMenuId}
          ref={menuRef}
          className={`md:hidden grid transition-[grid-template-rows] duration-300 ease-out ${
            mobileOpen ? "grid-rows-[1fr] mt-2" : "grid-rows-[0fr] mt-2"
          }`}>
          <div className="overflow-hidden">
            <nav className="flex flex-col gap-2 pb-4 border-t border-white/20">
              <Link href="/projects" className="text-sm p-2">
                Projects
              </Link>
              <Link href="/publications" className="text-sm p-2">
                Publications
              </Link>
              <Link href="/about" className="text-sm p-2">
                About
              </Link>
              <Link href="/services" className="text-sm p-2">
                Services
              </Link>
              <Link href="/contact" className="text-sm p-2">
                Contact
              </Link>
            </nav>
          </div>
        </div>
      </Container>
    </nav>
  );
}
