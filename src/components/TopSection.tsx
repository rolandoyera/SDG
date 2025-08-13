"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export default function TopSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={sectionRef}
      className="min-h-dvh flex items-center justify-center max-w-[1800px] mx-auto overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-center mx-auto w-full">
        <div
          className={`space-y-6 transition-all duration-1000 ease-out lg:col-span-2 ${
            isVisible
              ? "translate-x-0 opacity-100"
              : "-translate-x-full opacity-0"
          }`}>
          <h1 className="text-h1">Architectural & Interior Design Firm</h1>
          <p className="text-lg leading-relaxed">
            Sarvian Design is an award-winning architecture and interior design
            firm in Fort Lauderdale, serving clients throughout South Florida.
            By blending striking architectural forms with thoughtfully curated
            interiors, we create homes that flow effortlessly between indoor and
            outdoor spaces, uniting nature and design into one harmonious living
            experience.
          </p>
        </div>
        <div
          className={`relative transition-all duration-1000 ease-out delay-300 lg:col-span-3 ${
            isVisible
              ? "translate-x-0 opacity-100"
              : "translate-x-full opacity-0"
          }`}>
          <div className="p-[20px]">
            <Image
              src="/assets/about-us-top.jpg"
              alt="Home image"
              width={900}
              height={400}
              className="w-full h-auto object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
