"use client";

import { useCallback, useEffect, useState } from "react";

import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { listProjectSetImages } from "@/server/dropbox-actions";
import type { DropboxImage } from "@/types/dropbox";

/**
 * Designer-facing gallery of the images in a project set's linked Dropbox folder.
 * Thumbnails stream through the org-scoped proxy route
 * (`/api/projects/[projectId]/imagery/[setId]/thumb`) — the Dropbox token never
 * reaches the client. Clicking a thumbnail opens a lightweight lightbox.
 */
export function DropboxImageGallery({
  projectId,
  setId,
  folderName,
  onChange,
  onUnlink,
}: {
  projectId: string;
  setId: string;
  folderName: string;
  onChange: () => void;
  onUnlink: () => void;
}) {
  const [images, setImages] = useState<DropboxImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listProjectSetImages(projectId, setId).then((res) => {
      if (cancelled) return;
      if (res.success && res.images) {
        setImages(res.images);
      } else {
        setImages([]);
        setError(res.error ?? "Couldn't load images.");
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, setId]);

  const thumbSrc = (image: DropboxImage, size: "grid" | "full") =>
    `/api/projects/${projectId}/imagery/${setId}/thumb?path=${encodeURIComponent(
      image.path,
    )}${size === "full" ? "&size=full" : ""}`;

  return (
    // Bound the whole card (header + content) to the remaining viewport so it
    // never pushes the page taller; the thumbnail grid scrolls inside.
    <Card variant="panel" className="max-h-[calc(100vh-18rem)]">
      <CardHeader className="min-h-15">
        <div>
          <CardTitle>{folderName}</CardTitle>

          <CardDescription className="text-xs">
            {loading
              ? "Loading…"
              : `${images.length} ${images.length === 1 ? "image" : "images"}`}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onChange}>
            Change
          </Button>
          <Button variant="ghost" size="sm" onClick={onUnlink}>
            Unlink
          </Button>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto pt-0">
        {loading ? (
          <div className="flex min-h-40 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex min-h-40 items-center justify-center text-center">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        ) : images.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center text-center">
            <p className="text-muted-foreground text-sm">
              No images in this folder.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {images.map((image, i) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setOpenIndex(i)}
                className="relative aspect-square cursor-pointer overflow-hidden rounded bg-muted ring-1 ring-foreground/5 transition-opacity hover:opacity-90"
              >
                {/* biome-ignore lint/performance/noImgElement: the same-origin proxy already returns a sized, cache-controlled JPEG; next/image would re-optimize it and needs localPatterns config for the query string. */}
                <img
                  src={thumbSrc(image, "grid")}
                  alt={image.name}
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </CardContent>

      {openIndex !== null && images[openIndex] && (
        <Lightbox
          images={images}
          index={openIndex}
          srcFor={thumbSrc}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </Card>
  );
}

/** Lightweight full-screen viewer: backdrop/X/Esc to close, arrows to navigate. */
function Lightbox({
  images,
  index,
  srcFor,
  onIndexChange,
  onClose,
}: {
  images: DropboxImage[];
  index: number;
  srcFor: (image: DropboxImage, size: "grid" | "full") => string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const go = useCallback(
    (delta: number) =>
      onIndexChange((index + delta + images.length) % images.length),
    [index, images.length, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // Warm the browser cache for the neighbors so prev/next feel instant.
  useEffect(() => {
    if (images.length <= 1) return;
    for (const delta of [1, -1]) {
      const img = new window.Image();
      img.src = srcFor(
        images[(index + delta + images.length) % images.length],
        "full",
      );
    }
  }, [index, images, srcFor]);

  const image = images[index];
  const fullSrc = srcFor(image, "full");
  // Track which full src has finished loading so we can hold the low-res
  // placeholder (+ spinner) until the full image is ready — swapping by src
  // resets automatically on navigation.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === fullSrc;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      {/* Full-screen backdrop as a real button so click-to-close is keyboard-accessible. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <Button
        variant="ghost"
        size="icon"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-4 right-4 z-20 text-white hover:bg-white/10 hover:text-white"
      >
        <X />
      </Button>

      {images.length > 1 && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous"
          onClick={() => go(-1)}
          className="absolute left-4 z-20 text-white hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft />
        </Button>
      )}

      {/* Fills the viewport (minus padding) via object-contain, so the image is
          as large as possible without ever overflowing. Not interactive —
          clicking anywhere but the image closes via the backdrop. */}
      <div className="pointer-events-none relative z-10 flex h-full w-full items-center justify-center">
        {/* Instant low-res placeholder (the grid thumb is already cached) + spinner. */}
        {!loaded && (
          <>
            {/* biome-ignore lint/performance/noImgElement: cached same-origin thumbnail placeholder. */}
            <img
              src={srcFor(image, "grid")}
              alt=""
              aria-hidden
              className="absolute max-h-full max-w-full object-contain blur-sm"
            />
            <Loader2 className="absolute size-8 animate-spin text-white/80" />
          </>
        )}
        {/* biome-ignore lint/performance/noImgElement: same-origin proxy JPEG (see grid note); next/image adds no value here. */}
        <img
          src={fullSrc}
          alt={image.name}
          onLoad={() => setLoadedSrc(fullSrc)}
          className={cn(
            "max-h-full max-w-full object-contain transition-opacity duration-200",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      </div>

      {images.length > 1 && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next"
          onClick={() => go(1)}
          className="absolute right-4 z-20 text-white hover:bg-white/10 hover:text-white"
        >
          <ChevronRight />
        </Button>
      )}
    </div>
  );
}
