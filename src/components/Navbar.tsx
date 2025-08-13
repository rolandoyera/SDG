"use client";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { Sun, Moon, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import Container from "./ui/Container";

export default function Navbar() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuId = "primary-navigation";

  useEffect(() => setMounted(true), []);

  return (
    <nav id={menuId} aria-label="Primary" className="bg-nav text-foreground">
      <Container className="relative">
        {/* Equal-side layout keeps center logo truly centered */}
        <div className="relative flex items-center py-2">
          {/* LEFT CLUSTER */}
          <div className="flex-1 flex items-center gap-2">
            {/* Mobile: menu on the left */}
            <button
              type="button"
              className="md:hidden p-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-controls={menuId}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? "Close main menu" : "Open main menu"}
              onClick={() => setMobileOpen(!mobileOpen)}>
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
          <div className="flex-none w-20 h-20 z-10">
            <Link href="/" className="text-lg font-semibold">
              <div className="relative w-52 h-52 -mt-[55px] md:-ml-16 -ml-16">
                {/* Center logo */}
                <Image
                  className="absolute inset-0 m-auto rounded-full z-10 object-contain"
                  src="/logo-s.png"
                  alt="Sarvian Design Group"
                  width={0}
                  height={0}
                  sizes="52px"
                  style={{
                    width: "56px",
                    height: "auto",
                    filter: "var(--logo-filter)",
                  }}
                  priority
                />
                {/* Spinning circular text */}
                <svg
                  viewBox="0 0 120 120"
                  className="absolute inset-0 w-full h-full animate-spin"
                  style={{ animationDuration: "28s" }}
                  aria-hidden="true">
                  <defs>
                    {/* center (60,60), radius 20 */}
                    <path
                      id="textCircle"
                      d="M60,60 m-20,0 a20,20 0 1,1 40,0 a20,20 0 1,1 -40,0"
                    />
                  </defs>
                  <text className="fill-current" fontSize="6">
                    <textPath
                      href="#textCircle"
                      startOffset="0%"
                      lengthAdjust="spacing"
                      textLength="120">
                      SARVIAN • DESIGN • GROUP •
                    </textPath>
                  </text>
                </svg>
              </div>
            </Link>
          </div>

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

            {/* Theme toggle (visible on mobile + desktop, on the RIGHT) */}
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

          {/* Decorative circle centered under the logo */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 bottom-16 -translate-x-1/2 translate-y-1/2 w-[160px] h-[160px] rounded-full bg-nav z-5"
          />
        </div>

        {/* Mobile dropdown */}
        <div
          className={`md:hidden grid transition-[grid-template-rows] duration-300 ease-out ${
            mobileOpen ? "grid-rows-[1fr] mt-2" : "grid-rows-[0fr] mt-2"
          }`}
          aria-hidden={!mobileOpen}>
          <div className="overflow-hidden">
            <div className="flex flex-col gap-2 pb-4 border-t border-white/20">
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
            </div>
          </div>
        </div>
      </Container>
    </nav>
  );
}
