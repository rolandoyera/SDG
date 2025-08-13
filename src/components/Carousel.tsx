import React, { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "./ui/Button";
import Link from "next/link";
import Image from "next/image";

interface CarouselItem {
  id: string | number;
  image: string;
  title?: string;
  description?: string;
  buttonText?: string;
  buttonLink?: string;
  onButtonClick?: () => void;
}

interface CarouselProps {
  items: CarouselItem[];
  autoPlayInterval?: number;
  showArrows?: boolean;
  className?: string;
}

const Carousel: React.FC<CarouselProps> = ({
  items,
  autoPlayInterval = 5000,
  showArrows = true,
  className = "",
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prevIndex) =>
      prevIndex === items.length - 1 ? 0 : prevIndex + 1
    );
  }, [items.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prevIndex) =>
      prevIndex === 0 ? items.length - 1 : prevIndex - 1
    );
  }, [items.length]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  useEffect(() => {
    if (items.length <= 1) return;

    const interval = setInterval(nextSlide, autoPlayInterval);
    return () => clearInterval(interval);
  }, [nextSlide, autoPlayInterval, items.length]);

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-200 rounded-lg">
        <p className="text-gray-500">No items to display</p>
      </div>
    );
  }

  return (
    <div className={`relative w-full overflow-hidden ${className}`}>
      {/* Main carousel container */}
      <div className="relative h-[calc(100vh-100px)] overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out h-full"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
          {items.map((item, idx) => (
            <div key={item.id} className="min-w-full h-full relative">
              <Image
                src={item.image}
                alt={item.title || "Interior Design Carousel Item"}
                fill
                priority={idx === 0}
                sizes="100vw"
                className={`object-cover transition-transform duration-[3000ms] ease-out
          ${
            idx === currentIndex ? "scale-103 delay-500" : "scale-100 delay-0"
          }`}
                style={{ willChange: "transform" }}
              />

              {(item.title || item.description) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 p-6">
                  <div className="text-center">
                    {item.title && (
                      <h3 className="text-white text-4xl font-bold mb-2">
                        {item.title}
                      </h3>
                    )}
                    {item.description && (
                      <p className="text-white/90 text-base">
                        {item.description}
                      </p>
                    )}
                    {item.buttonText && item.buttonLink && (
                      <Link href={item.buttonLink}>
                        <Button className="mt-4">{item.buttonText}</Button>
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Navigation arrows */}
        {showArrows && items.length > 1 && (
          <>
            <button
              onClick={prevSlide}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-brand/80 hover:bg-brand text-white p-2 rounded-full shadow-md transition-all duration-200 hover:scale-110 cursor-pointer"
              aria-label="Previous slide">
              <ChevronLeft size={24} />
            </button>
            <button
              onClick={nextSlide}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-brand/80 hover:bg-brand text-white p-2 rounded-full shadow-md transition-all duration-200 hover:scale-110 cursor-pointer"
              aria-label="Next slide">
              <ChevronRight size={24} />
            </button>
          </>
        )}

        {/* Auto-play toggle removed - always autoplaying */}
      </div>
    </div>
  );
};

export default Carousel;
