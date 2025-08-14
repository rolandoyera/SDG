// app/projects/[slug]/page.tsx
import Button from "@/components/ui/Button";
import Image from "next/image";
import { groq } from "next-sanity";
import { client } from "@/sanity/lib/client";
import { urlFor, type SanityImageWithAlt } from "@/sanity/lib/image";
import { notFound } from "next/navigation";
import { PortableText } from "@portabletext/react";
import type { PortableTextBlock } from "@portabletext/types";
import ContactButton from "@/components/ui/ContactButton";

/* -------------------- Types -------------------- */

type Project = {
  _id: string;
  title: string;
  slug?: { current: string } | string;
  location?: string;
  type?: string;
  year?: number;
  size?: string | number;

  heroImage?: SanityImageWithAlt;
  mainImage?: SanityImageWithAlt;
  gallery?: SanityImageWithAlt[];

  intro?: string;
  description?: PortableTextBlock[];
  body?: PortableTextBlock[];
};

/* -------------------- GROQ -------------------- */

const PROJECT_BY_SLUG = groq`*[_type=="project" && slug.current == $slug][0]{
  _id,
  title,
  "slug": slug.current,
  location,
  type,
  year,
  size,
  heroImage{ ..., alt, asset->{ url, metadata{ dimensions } } },
  mainImage{ ..., alt, asset->{ url, metadata{ dimensions } } },
  gallery[]{ ..., alt, asset->{ url, metadata{ dimensions } } },
  intro,
  description,
  body
}`;

const ALL_SLUGS = groq`*[_type=="project" && defined(slug.current)]{ "slug": slug.current }`;

/* -------------------- ISR -------------------- */

export const revalidate = 60;

export async function generateStaticParams() {
  const slugs: { slug: string }[] = await client.fetch(ALL_SLUGS);
  return slugs.map((s) => ({ slug: s.slug }));
}

/* -------------------- Page -------------------- */

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await client.fetch<Project | null>(PROJECT_BY_SLUG, { slug });
  if (!data) return notFound();

  const hero = data.heroImage || data.mainImage;
  const rich = data.description ?? data.body;
  const gallery = Array.isArray(data.gallery) ? data.gallery : [];

  // Sort: landscapes first, then portraits, then square/unknown (stable within groups)
  const sortedGallery: SanityImageWithAlt[] = gallery
    .map((img, idx) => {
      const dims = img.asset.metadata?.dimensions;
      const ar =
        dims?.aspectRatio ??
        (dims?.width && dims?.height ? dims.width / dims.height : 1);
      const group = ar > 1.01 ? 0 : ar < 0.99 ? 1 : 2; // 0 = landscape, 1 = portrait, 2 = square/unknown
      return { img, idx, group };
    })
    .sort((a, b) => (a.group === b.group ? a.idx - b.idx : a.group - b.group))
    .map((x) => x.img);

  return (
    <main>
      <div className="mx-auto">
        {/* 1) Full-bleed banner */}
        {hero && (
          <section className="relative h-[70vh] overflow-hidden">
            <Image
              src={urlFor(hero).width(2400).height(1400).auto("format").url()}
              alt={hero.alt || data.title}
              fill
              priority
              fetchPriority="high"
              sizes="100vw"
              className="object-cover"
            />
          </section>
        )}

        {/* 2) Content row: left = info (sticky), right = gallery */}
        <section className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:p-6">
          {/* LEFT: Project info */}
          <aside className="lg:col-span-4">
            <div className="lg:sticky lg:top-24">
              <div className="bg-info text-white p-2 sm:p-4 md:p-8 lg:p-12 xl:p-16">
                <h1 className="text-3xl font-semibold">{data.title}</h1>
                {data.location && (
                  <p className="text-sm text-white/80">{data.location}</p>
                )}

                <dl className="mt-10 space-y-2 text-sm">
                  <div className="flex justify-between border-b border-white/15 pb-2">
                    <dt className="text-white/80">
                      <h2 className="text-h5">Firm</h2>
                    </dt>
                    <dd className="text-white">Sarvian Design Group</dd>
                  </div>

                  {data.type && (
                    <div className="flex justify-between border-b border-white/15 pb-2">
                      <dt className="text-white/80">
                        <h2 className="text-h5">Type</h2>
                      </dt>
                      <dd className="text-white capitalize">{data.type}</dd>
                    </div>
                  )}

                  {data.size && (
                    <div className="flex justify-between border-b border-white/15 pb-2">
                      <dt className="text-white/80">
                        <h2 className="text-h5">Size</h2>
                      </dt>
                      <dd className="text-white">
                        {typeof data.size === "number"
                          ? `${data.size.toLocaleString()} Sq Ft`
                          : data.size}
                      </dd>
                    </div>
                  )}

                  {typeof data.year === "number" && (
                    <div className="flex justify-between">
                      <dt className="text-white/80">
                        <h2 className="text-h5">Year</h2>
                      </dt>
                      <dd className="text-white">{data.year}</dd>
                    </div>
                  )}
                </dl>

                {data.intro && (
                  <p className="mt-16 text-sm leading-6 text-white/85">
                    {data.intro}
                  </p>
                )}

                {Array.isArray(rich) && rich.length > 0 && (
                  <div className="mt-10 prose prose-invert prose-sm max-w-none richtext text-justify">
                    <PortableText value={rich} />
                  </div>
                )}

                <div className="w-full mt-16 flex">
                  <ContactButton className="w-full flex items-center justify-center">
                    Start a Similar Project
                  </ContactButton>
                </div>
              </div>
            </div>
          </aside>

          {/* RIGHT: Image grid (2 columns, natural aspect, NO rounding) */}
          <div className="lg:col-span-8">
            {sortedGallery.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {sortedGallery.map((img, i) => {
                  const dims = img.asset.metadata?.dimensions;
                  const ar = dims?.aspectRatio ?? 4 / 3;
                  const width = Math.min(dims?.width ?? 1600, 1800);
                  const height = Math.round(width / ar);

                  return (
                    <Image
                      key={i}
                      src={urlFor(img).width(width).auto("format").url()}
                      alt={img.alt || `Project image ${i + 1}`}
                      width={width}
                      height={height}
                      loading="lazy"
                      decoding="async"
                      sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                      className="w-full h-auto"
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
