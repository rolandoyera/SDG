// sanity/lib/image.ts
import createImageUrlBuilder from "@sanity/image-url";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { dataset, projectId } from "../env";

if (!projectId || !dataset) {
  throw new Error(
    "Missing SANITY projectId or dataset in environment variables."
  );
}

const builder = createImageUrlBuilder({ projectId, dataset });

/** Minimal shapes we actually use when we query with `asset->` */
export type SanityImageDimensions = {
  width: number;
  height: number;
  aspectRatio: number;
};

export type SanityImageAsset = {
  _type: "sanity.imageAsset";
  url: string;
  metadata?: { dimensions?: SanityImageDimensions };
};

export type SanityImageWithAlt = {
  _type: "image";
  alt?: string;
  asset: SanityImageAsset;
};

/** Works with either a plain SanityImageSource or our populated image object */
export const urlFor = (source: SanityImageSource | SanityImageWithAlt) =>
  builder
    .image(source as SanityImageSource)
    .auto("format")
    .fit("max");

/** Helper for next/image */
export const imageProps = (
  source: SanityImageWithAlt,
  width: number,
  height?: number
) => {
  let img = builder
    .image(source as unknown as SanityImageSource)
    .width(width)
    .auto("format");
  if (height) img = img.height(height);

  return {
    src: img.url(),
    alt: source.alt || "",
  };
};

/** Optional: grab dimensions safely when sorting/layout */
export const getDimensions = (img?: SanityImageWithAlt) =>
  img?.asset?.metadata?.dimensions;
