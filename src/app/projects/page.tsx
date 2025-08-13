// app/projects/page.tsx
import Image from "next/image";
import Link from "next/link";
import { groq } from "next-sanity";
import { client } from "@/sanity/lib/client";
import Main from "@/components/ui/Main";
import Container from "@/components/ui/Container";

const QUERY = groq`
  *[_type == "project" && defined(mainImage)]{
    _id,
    title,
    location,
    "slug": slug.current,
    "imageUrl": mainImage.asset->url
  } | order(_createdAt desc)
`;

export default async function ProjectsPage() {
  let projects: {
    _id: string;
    title: string;
    location: string;
    slug: string;
    imageUrl: string;
  }[] = [];

  try {
    projects = await client.fetch(QUERY);
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    // Could add a user-friendly error message here
  }

  return (
    <Main>
      <Container>
        <h1 className="text-3xl font-semibold mb-8">Our Projects</h1>
        <div className="grid md:grid-cols-2 gap-8">
          {projects.map((p, index) => (
            <Link
              key={p._id}
              href={`/projects/${p.slug}`}
              className="group relative overflow-hidden block"
              aria-label={`${p.title} — ${p.location}`}>
              <div className="relative w-full aspect-[4/3]">
                <Image
                  src={p.imageUrl}
                  alt={p.title}
                  priority={index < 2}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-info/55 text-white backdrop-blur-md">
                  <h2 className="text-2xl font-semibold">{p.title}</h2>
                  <p className="text-lg mt-1">{p.location}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </Main>
  );
}
