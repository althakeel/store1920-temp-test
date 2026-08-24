import React, { useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Img1 from '../assets/section/Bags.png';
import Img2 from '../assets/section/books.png';
import Img3 from '../assets/section/Electronics.png';
import Img4 from '../assets/section/footwear.png';
import Img5 from '../assets/section/Makeup.png';
import Img6 from '../assets/section/Mensperfume.png';
import Img7 from '../assets/section/personalcare.png';
import Img8 from '../assets/section/Smartphone.png';
import Img9 from '../assets/section/kidsfashion.png';
import Img10 from '../assets/section/womensfashion.png';

const brands = [
  { name: "Bags", image: Img1, path: "/category/bags-backpacks-wallets" },
  { name: "Books", image: Img2, path: "/category/books" },
  { name: "Electronics", image: Img3, path: "/category/electronics" },
  { name: "Footwear", image: Img4, path: "/category/men-s-footwear" },
  { name: "Makeup", image: Img5, path: "/category/beauty-personal-care" },
  { name: "Men Perfume", image: Img6, path: "/category/perfumes-deodorants" },
  { name: "Personal Care", image: Img7, path: "/category/skin-body-care" },
  { name: "Tshirt", image: Img8, path: "/category/men-s-t-shirts" },
  { name: "Kids Fashion", image: Img9, path: "/category/kids-fashion" },
  { name: "Womens Fashion", image: Img10, path: "/category/womens-fashion" },
];


export default function SmoothBrands({ data = brands }) {
  const router = useRouter();
  const sliderRef = useRef(null);

  // Scroll by card width
  const scrollBy = (dir) => {
    if (!sliderRef.current) return;
    const card = sliderRef.current.querySelector('.brand-card');
    if (!card) return;
    sliderRef.current.scrollBy({
      left: dir * (card.offsetWidth + 16), 
      behavior: 'smooth'
    });
  };

  // Auto-snap to nearest card after scroll ends
  const handleScrollEnd = () => {
    if (!sliderRef.current) return;
    const cards = sliderRef.current.querySelectorAll('.brand-card');
    if (!cards.length) return;
    const sliderLeft = sliderRef.current.scrollLeft;
    let closest = cards[0];
    let minDist = Math.abs(sliderLeft - closest.offsetLeft);
    cards.forEach(card => {
      const dist = Math.abs(sliderLeft - card.offsetLeft);
      if (dist < minDist) {
        minDist = dist;
        closest = card;
      }
    });
    sliderRef.current.scrollTo({
      left: closest.offsetLeft,
      behavior: 'smooth'
    });
  };

  return (
    <section className="py-0 sm:py-6 w-full flex justify-center">
      <div className="w-full max-w-[1300px]">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-lg sm:text-2xl font-semibold flex items-center gap-2">
            Most Popular Categories
            <span className="inline-block text-blue-600">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
                <path d="M12 2L15 8.5L22 9.3L17 14.1L18.2 21L12 17.8L5.8 21L7 14.1L2 9.3L9 8.5L12 2Z" fill="#3b82f6"/>
              </svg>
            </span>
          </h2>
          <button className="text-purple-700 font-medium text-sm sm:text-base flex items-center gap-1 hover:underline"
            onClick={() => router.push("/brands")}>
            VIEW ALL <span className="text-base sm:text-lg">&rarr;</span>
          </button>
        </div>

        <div className="relative">
          {/* Left arrow */}
          <button
            className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white border border-slate-200 rounded-full shadow p-2 hover:bg-slate-100"
            style={{ left: '-18px' }}
            onClick={() => scrollBy(-1)}
          >
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7" stroke="#6c2bd7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Slider */}
          <div
            ref={sliderRef}
            className="flex gap-4 px-0 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar select-none"
            style={{ WebkitOverflowScrolling: 'touch', cursor: 'grab' }}
            onMouseDown={(e) => { e.currentTarget.style.cursor = 'grabbing'; }}
            onMouseUp={(e) => { e.currentTarget.style.cursor = 'grab'; handleScrollEnd(); }}
            onTouchEnd={handleScrollEnd}
          >
            {data.map((brand, idx) => (
              <div
                key={brand.name}
                className="brand-card snap-start cursor-pointer flex items-center justify-center min-h-[140px] sm:min-h-[180px] h-[140px] sm:h-[220px] min-w-[calc(100%/4)] sm:min-w-[28.5%] lg:min-w-[15.5%] max-w-[220px] bg-white rounded-xl shadow-sm lg:h-[270px] lg:max-w-[260px]"
                onClick={() => router.push(brand.path)}
                style={{ paddingTop: 0, paddingBottom: 0 }}
              >
                <Image
                  src={brand.image}
                  alt={brand.name}
                  className="object-contain w-full h-full"
                  width={200}
                  height={220}
                  style={{ width: 'auto', height: 'auto' }}
                  priority={idx < 5}
                  draggable={false}
                />
              </div>
            ))}
          </div>

          {/* Right arrow */}
          <button
            className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white border border-slate-200 rounded-full shadow p-2 hover:bg-slate-100"
            style={{ right: '-18px' }}
            onClick={() => scrollBy(1)}
          >
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" stroke="#6c2bd7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
