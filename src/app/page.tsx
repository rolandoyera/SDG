import OurApproachSection from "@/components/Approach";
import Carousel from "@/components/Carousel";
import Connect from "@/components/Connect";
import TopSection from "@/components/TopSection";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fort Lauderdale & Miami Interior Design",
  description:
    "Sarvian Design delivers Fort Lauderdale interior design, Miami interior design, and South Florida architecture.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Fort Lauderdale & Miami Interior Design | Sarvian Design Group",
    description:
      "Sarvian Design delivers Fort Lauderdale interior design, Miami interior design, and South Florida architecture.",
    url: "https://www.sarviandesign.com/",
    siteName: "Sarvian Design Group",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fort Lauderdale & Miami Interior Design",
    description:
      "Sarvian Design delivers Fort Lauderdale interior design, Miami interior design, and South Florida architecture.",
  },
};

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

      <section className="min-h-dvh p-6 xl:p-0">
        <TopSection />
      </section>
      <section className="min-h-dvh">
        <OurApproachSection />
      </section>

      <Connect />
    </>
  );
}
