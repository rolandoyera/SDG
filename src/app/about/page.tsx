// app/about/page.tsx
"use client";

import Main from "@/components/ui/Main";
import Image from "next/image";

export default function AboutPage() {
  return (
    <Main>
      <section className="relative max-w-[1600px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 mx-auto px-5 py-10">
          {/* Slice 1 */}
          <div className="relative h-[300px] md:h-[550px] overflow-hidden">
            <Image
              src="/assets/1-short.jpg"
              alt="Sarvian design showcase - elegant interior design elements"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
              priority
              className="object-cover img-reveal"
            />
          </div>
          {/* Slice 2 */}
          <div className="relative h-[400px] md:h-[830px] overflow-hidden">
            <Image
              src="/assets/2-short.jpg"
              alt="Sarvian design showcase - sophisticated living space"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
              priority
              className="object-cover img-reveal"
            />
          </div>
          {/* Slice 3 */}
          <div className="relative h-[500px] md:h-[1098px] overflow-hidden">
            <Image
              src="/assets/3-short.jpg"
              alt="Sarvian design showcase - luxury interior details"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
              priority
              className="object-cover img-reveal"
            />
          </div>
          {/* Slice 4 */}
          <div className="relative h-[450px] md:h-[940px] overflow-hidden">
            <Image
              src="/assets/4-short.jpg"
              alt="Sarvian design showcase - refined architectural elements"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
              priority
              className="object-cover img-reveal"
            />
          </div>
        </div>

        {/* Text Overlay */}
        <div className="absolute bottom-30 left-10 max-w-lg slide-up">
          <h2 className="text-4xl md:text-6xl leading-tight">ABOUT</h2>
          <h3 className="text-5xl md:text-8xl font-extrabold ml-10">SARVIAN</h3>
          <p className="mt-4 text-base md:text-lg opacity-80">
            Our family’s dedication to this noble material reflects a deep
            respect for its history and potential.
          </p>
        </div>
      </section>
    </Main>
  );
}
