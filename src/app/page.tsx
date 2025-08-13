"use client";
import OurApproachSection from "@/components/Approach";
import Carousel from "@/components/Carousel";
import Connect from "@/components/Connect";
import TopSection from "@/components/TopSection";

interface CarouselItem {
  id: string | number;
  image: string;
  title?: string;
  description?: string;
  buttonText?: string;
  buttonLink?: string;
  onButtonClick?: () => void;
}

const sliderItems: CarouselItem[] = [
  {
    id: 1,
    image: "/slider/South-Beach-Living-Interior-Design.jpg",
    title: "South Beach Living",
    description: "Stunning sunset over the ocean waves",
    buttonText: "Explore Now",
    buttonLink: "/projects/south-beach",
  },
  {
    id: 2,
    image: "/slider/aventura-interior-design.jpg",
    title: "Aventura",
    description: "Sunlit luxury meets serene modern design",
    buttonText: "Explore Now",
    buttonLink: "/projects/aventura-modern-living",
  },
];

export default function Home() {
  return (
    <>
      <Carousel items={sliderItems} autoPlayInterval={5000} showArrows={true} />

      <section className="min-h-dvh">
        <TopSection />
      </section>
      <section className="min-h-dvh">
        <OurApproachSection />
      </section>

      <Connect />
    </>
  );
}
