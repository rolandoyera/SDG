"use client";

import {
  Forklift,
  MoreVertical,
  Trash2,
  Edit,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  TooltipDropdownMenu,
} from "@/components/ui/dropdown-menu";
import type { LibraryItem } from "@/lib/types";

import HeaderBackLink from "../../_components/HeaderBackLink";
import { H1 } from "@/components/ui/typography";
import { NextLink } from "@/components/ui/next-link";

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

      <div className="flex flex-col justify-start gap-16 pb-4 md:flex-row mt-2">
        <div className="flex flex-col">
          <H1 className="mb-2">{item.name}</H1>
          {vendorName && (
            <div className="flex items-center gap-1">
              <Forklift className="size-3.5 shrink-0 text-primary" />
              {item.vendorId ? (
                <NextLink href={`/dashboard/vendors/${item.vendorId}`}>
                  {vendorName}
                </NextLink>
              ) : (
                ""
              )}

              <div className="flex items-center gap-2 ml-4 mt-1">
                {item.category && (
                  <NextLink
                    variant="label"
                    href={`/dashboard/library?category=${encodeURIComponent(item.category)}`}
                  >
                    {item.category}
                  </NextLink>
                )}
                {item.subcategory && (
                  <ChevronRight size="10px" className="text-muted-foreground" />
                )}
                {item.subcategory && (
                  <NextLink
                    variant="label"
                    href={`/dashboard/library?category=${encodeURIComponent(item.category)}&subcategory=${encodeURIComponent(item.subcategory)}`}
                  >
                    {item.subcategory}
                  </NextLink>
                )}
              </div>
            </div>
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
