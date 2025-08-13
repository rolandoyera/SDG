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

export const urlFor = (source: SanityImageSource) =>
  builder.image(source).auto("format").fit("max");

// Type for Sanity image with alt text
type SanityImageWithAlt = SanityImageSource & { alt?: string };

/**
 * Helper for next/image
 * Example: <Image {...imageProps(myImage, 800, 600)} />
 */
export const imageProps = (
  source: SanityImageWithAlt,
  width: number,
  height?: number
) => {
  let img = builder.image(source).width(width).auto("format");
  if (height) img = img.height(height);

  return {
    src: img.url(),
    alt: source.alt || "",
  };
};
