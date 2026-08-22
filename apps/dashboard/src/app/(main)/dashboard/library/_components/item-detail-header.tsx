"use client";

import Link from "next/link";

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

      <div className="flex flex-col justify-start gap-16 pb-4 md:flex-row mt-2">
        <div className="flex flex-col">
          <H1 className="mb-2">{item.name}</H1>
          {vendorName && (
            <div className="flex items-center">
              <Forklift className="size-3.5 shrink-0 text-primary" />
              {item.vendorId ? (
                <Link href={`/dashboard/vendors/${item.vendorId}`}>
                  <Button
                    variant="link"
                    className="text-foreground hover:text-primary p-0 pl-1 text-lg"
                  >
                    {vendorName}
                  </Button>
                </Link>
              ) : (
                ""
              )}

              <div className="flex items-center gap-2 ml-3 mt-1">
                {item.category && (
                  <div className="text-muted-foreground tracking-wider text-xs uppercase">
                    <Link
                      href={`/dashboard/library?category=${encodeURIComponent(item.category)}`}
                    >
                      <Button
                        size="sm"
                        variant="link"
                        className="tracking-wider text-xs uppercase"
                      >
                        {item.category}
                      </Button>
                    </Link>
                  </div>
                )}
                {item.subcategory && (
                  <ChevronRight size="10px" className="text-muted-foreground" />
                )}
                {item.subcategory && (
                  <Label>
                    <Link
                      href={`/dashboard/library?category=${encodeURIComponent(item.category)}&subcategory=${encodeURIComponent(item.subcategory)}`}
                    >
                      <Button
                        variant="link"
                        size="sm"
                        className="tracking-wider text-xs uppercase"
                      >
                        {item.subcategory}
                      </Button>
                    </Link>
                  </Label>
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
