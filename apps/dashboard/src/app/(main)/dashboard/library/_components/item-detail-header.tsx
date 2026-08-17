"use client";

import Link from "next/link";

import { Forklift, MoreVertical, Trash2, Edit } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  TooltipDropdownMenu,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import type { LibraryItem } from "@/lib/types";

import HeaderBackLink from "../../_components/HeaderBackLink";

interface ItemDetailHeaderProps {
  item: LibraryItem;
  vendorName?: string;
  onEdit: () => void;
  onRequestDelete: () => void;
}

/** Back link, item title banner, and the edit/delete actions menu. */
export function ItemDetailHeader({
  item,
  vendorName,
  onEdit,
  onRequestDelete,
}: ItemDetailHeaderProps) {
  return (
    <>
      <HeaderBackLink href="/dashboard/library" />

      <div className="flex flex-col justify-start gap-16 pb-4 md:flex-row md:items-center">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/library?category=${encodeURIComponent(item.category)}`}
            >
              <Badge variant="secondary">{item.category}</Badge>
            </Link>
            {item.subcategory && (
              <span>
                <span className="mr-0.5">→</span>{" "}
                <Link
                  href={`/dashboard/library?category=${encodeURIComponent(item.category)}&subcategory=${encodeURIComponent(item.subcategory)}`}
                >
                  <Badge variant="outline">{item.subcategory}</Badge>
                </Link>
              </span>
            )}
          </div>
          <h1 className="mt-1 font-heading font-medium text-3xl tracking-tight">
            {item.name}
          </h1>
          {vendorName && (
            <p className="flex items-center gap-1 font-medium text-[12px] text-muted-foreground">
              <Forklift className="size-3.5 shrink-0 text-primary" />

              {item.vendorId ? (
                <Link
                  href={`/dashboard/vendors/${item.vendorId}`}
                  className="cursor-pointer transition-colors hover:text-primary hover:underline"
                >
                  <Label
                    size="large"
                    className="cursor-pointer text-foreground hover:text-primary"
                  >
                    {vendorName}
                  </Label>
                </Link>
              ) : (
                <Label size="large">{vendorName}</Label>
              )}
            </p>
          )}
        </div>

        <div>
          <TooltipDropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="size-4" />
                <span className="sr-only">Actions Menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={onEdit}>
                  <Edit size={4} />
                  Edit Item
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={onRequestDelete}
                  variant="destructive"
                >
                  <Trash2 size={4} />
                  Delete Product
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </TooltipDropdownMenu>
        </div>
      </div>
    </>
  );
}
