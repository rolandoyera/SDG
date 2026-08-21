"use client";

import Link from "next/link";

import { Forklift, MoreVertical, Trash2, Edit } from "lucide-react";
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
import { H1 } from "@/components/ui/typography";

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

      <div className="flex flex-col justify-start gap-16 pb-4 md:flex-row">
        <div className="flex flex-col">
          <H1 className="mb-1">{item.name}</H1>
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
          <div className="flex items-center text-xs -mt-2 ml-1">
            In:
            <Link
              href={`/dashboard/library?category=${encodeURIComponent(item.category)}`}
            >
              <Button
                variant="link"
                className="flex cursor-pointer items-center text-muted-foreground text-xs hover:bg-transparent hover:text-primary"
              >
                {item.category}
              </Button>
            </Link>
            {item.subcategory && (
              <div className="flex items-center">
                <span>→</span>
                <Link
                  href={`/dashboard/library?category=${encodeURIComponent(item.category)}&subcategory=${encodeURIComponent(item.subcategory)}`}
                >
                  <Button className="flex cursor-pointer items-center gap-1.5 bg-transparent text-muted-foreground text-xs hover:bg-transparent hover:text-primary">
                    {item.subcategory}
                  </Button>
                </Link>
              </div>
            )}
          </div>
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
