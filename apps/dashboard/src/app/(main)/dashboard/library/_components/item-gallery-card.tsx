"use client";

import { Image, ShoppingBag } from "lucide-react";

import { DashboardImage } from "@/components/dashboard-image";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LibraryItem } from "@/lib/types";

interface ItemGalleryCardProps {
  item: LibraryItem;
  activeImage: string;
  onSelectImage: (url: string) => void;
}

/** Sourcing gallery: large active preview plus a clickable thumbnail strip. */
export function ItemGalleryCard({
  item,
  activeImage,
  onSelectImage,
}: ItemGalleryCardProps) {
  return (
    <Card variant="panel" className="overflow-hidden">
      <CardHeader>
        <CardTitle>
          <Image className="icons" />
          Product Gallery
        </CardTitle>
        {activeImage === item.coverImageUrl && activeImage && (
          <Badge variant="overlay">Primary Cover</Badge>
        )}
      </CardHeader>
      <CardContent className="relative flex aspect-16/14.5 w-full items-center justify-center">
        {activeImage ? (
          <DashboardImage
            src={activeImage}
            alt={item.name}
            loading="eager"
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-contain px-2"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground/30">
            <ShoppingBag className="size-16" />
            <p className="text-xs uppercase tracking-wider">
              No photos uploaded
            </p>
          </div>
        )}
      </CardContent>

      {item.imageUrls && item.imageUrls.length > 0 && (
        <CardFooter className="h-23">
          <div className="flex flex-wrap gap-4">
            {item.imageUrls.map((url) => (
              <button
                key={url}
                type="button"
                className={`relative size-16 shrink-0 cursor-pointer overflow-hidden rounded border transition-all ${
                  activeImage === url
                    ? "scale-105 border-primary ring-2 ring-primary/20"
                    : "border-border/60 hover:border-border"
                }`}
                onClick={() => onSelectImage(url)}
              >
                <DashboardImage
                  src={url}
                  alt="thumbnail"
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
