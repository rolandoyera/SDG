// app/projects/[slug]/page.tsx
import Button from "@/components/ui/Button";
import Image from "next/image";
import { groq } from "next-sanity";
import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";
import { notFound } from "next/navigation";
import { PortableText } from "@portabletext/react";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import type { PortableTextBlock } from "@portabletext/types";

// Extend the image type to include optional `alt` that you added in schema
type SanityImageWithAlt = SanityImageSource & { alt?: string };

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

const PROJECT_BY_SLUG = groq`*[_type=="project" && slug.current == $slug][0]{
  _id,
  title,
  "slug": slug.current,
  location,
  type,
  year,
  size,
  heroImage,
  mainImage,
  gallery[]{..., asset->},
  intro,
  description,
  body
}`;

const ALL_SLUGS = groq`*[_type=="project" && defined(slug.current)]{ "slug": slug.current }`;

export const revalidate = 60;

export async function generateStaticParams() {
  const slugs: { slug: string }[] = await client.fetch(ALL_SLUGS);
  return slugs.map((s) => ({ slug: s.slug }));
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>; // ← Make params a Promise
}) {
  const { slug } = await params; // ← Await params before destructuring

  const data = await client.fetch<Project | null>(PROJECT_BY_SLUG, { slug });
  if (!data) return notFound();

  const hero = data.heroImage || data.mainImage;
  const rich = data.description ?? data.body;

  return (
    <main>
      <div className="mx-auto">
        {/* 1) Full‑bleed banner */}
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
        <section className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
          <aside className="lg:col-span-4 lg:-mt-40 xl:-mt-70 relative z-10">
            <div className="lg:sticky lg:top-24">
              <div className="bg-info/55 text-white backdrop-blur-md p-2 sm:p-4 md:p-8 lg:p-12 xl:p-16 shadow-md">
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
                  <div className="mt-10 prose prose-invert prose-sm max-w-none richtext">
                    <PortableText value={rich} />
                  </div>
                )}

                <div className="w-full mt-16 flex">
                  <Button
                    href="/connect"
                    className="w-full flex items-center justify-center">
                    Start a Similar Project
                  </Button>
                </div>
              </div>
            </div>
          </aside>

          {/* RIGHT: Image grid */}
          <div className="lg:col-span-8">
            {Array.isArray(data.gallery) && data.gallery.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 ">
                {data.gallery.map((img: SanityImageWithAlt, i: number) => (
                  <div
                    key={i}
                    className="relative aspect-[4/3] overflow-hidden">
                    <Image
                      src={urlFor(img)
                        .width(1200)
                        .height(900)
                        .auto("format")
                        .url()}
                      alt={img.alt || `Project image ${i + 1}`}
                      fill
                      loading="lazy"
                      sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
