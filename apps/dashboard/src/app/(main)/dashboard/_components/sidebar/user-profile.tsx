"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { doc, setDoc } from "firebase/firestore";
import { BadgeCheck, LogOut } from "lucide-react";

import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { db } from "@/lib/firebase";
import { getInitials } from "@/lib/utils";

export function UserProfile() {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      if (user?.uid) {
        const userDocRef = doc(db, "users", user.uid);
        await setDoc(userDocRef, { lastActive: 0 }, { merge: true });
      }
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("explicit_logout", "true");
      }
      await signOut();
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  if (!profile) {
    return (
      <div className="size-8 animate-pulse rounded border border-border/20 bg-muted/60" />
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className="hover:cursor-pointer">
        <Button size="icon" variant="secondary">
          {getInitials(profile.fullName)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="mt-2 min-w-56 space-y-1 rounded"
        side="bottom"
        align="end"
        sideOffset={4}>
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/profile" className="hover:cursor-pointer">
              <BadgeCheck />
              Profile
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
