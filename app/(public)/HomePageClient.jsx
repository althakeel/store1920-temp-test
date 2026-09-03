'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { HOME_SECTION_STACK_CLASS } from '@/lib/storefrontCarousel';

import HeroBannerSlider from '@/components/HeroBannerSlider';
import LatestProducts from '@/components/LatestProducts';
import ShopShowcaseSection from '@/components/ShopShowcaseSection';
const HomeCategories = dynamic(() => import('@/components/HomeCategories'), {
  ssr: false,
  loading: () => <HomeCategoryRowSkeleton />,
});
import DeferredSection from '@/components/DeferredSection';
import {
  HomeBannerSkeleton,
  HomeCategorySlidersSkeleton,
  HomeExploreInterestsSkeleton,
  HomeProductCarouselSkeleton,
  HomeProductGridSkeleton,
  HomeCategoryRowSkeleton,
} from '@/components/home/HomeSectionSkeletons';

const BannerSlider = dynamic(() => import('@/components/BannerSlider'), {
  ssr: false,
  loading: () => <HomeBannerSkeleton />,
});
const BannerSlider2 = dynamic(() => import('@/components/BannerSlider2'), {
  ssr: false,
  loading: () => <HomeBannerSkeleton />,
});
const Section3 = dynamic(() => import('@/components/section3'), {
  ssr: false,
  loading: () => <HomeProductGridSkeleton count={6} />,
});
const Section4 = dynamic(() => import('@/components/section4'), {
  ssr: false,
  loading: () => <HomeCategorySlidersSkeleton sections={2} />,
});
const CategoryInterestSection = dynamic(() => import('@/components/CategoryInterestSection'), {
  ssr: false,
  loading: () => <HomeExploreInterestsSkeleton productCount={6} />,
});
const RecentSearchProducts = dynamic(() => import('@/components/RecentSearchProducts'), {
  ssr: false,
  loading: () => <HomeProductGridSkeleton count={6} />,
});
const RecommendedProducts = dynamic(() => import('@/components/RecommendedProducts'), {
  ssr: false,
  loading: () => <HomeProductCarouselSkeleton count={6} />,
});

export default function HomePageClient({ initialData }) {
  const {
    shopShowcase = { config: null, sectionProducts: [], products: [], categories: [] },
    homeSections = [],
    featuredSectionsCount = 0,
    featuredProducts = { products: [], sectionTitle: '', sectionDescription: '' },
    appearance = {},
    storeSettings = {},
  } = initialData || {};

  const shopShowcaseConfig = shopShowcase?.config || null;

  const showHeroCategories = useMemo(
    () =>
      homeSections.some(
        (section) =>
          section?.isActive !== false &&
          (section?.sectionType === 'hero_categories' || section?.section === 'home_categories_slider')
      ),
    [homeSections]
  );

  const secondaryBannerSliderPlacement = useMemo(() => {
    const configured = shopShowcaseConfig?.secondaryBannerSliderPlacement;
    return configured === 'below_top_deals' || configured === 'below_small_banners'
      ? configured
      : 'above_top_deals';
  }, [shopShowcaseConfig]);

  const secondaryBannerSlides = useMemo(() => {
    if (!shopShowcaseConfig) return [];
    return (shopShowcaseConfig.secondaryBannerSliderItems || []).filter((item) => String(item?.image || '').trim());
  }, [shopShowcaseConfig]);

  const showSecondaryBannerAt = (placement) =>
    secondaryBannerSliderPlacement === placement &&
    shopShowcaseConfig?.secondaryBannerSliderEnabled !== false &&
    secondaryBannerSlides.length > 0;

  return (
    <div className="pt-5 sm:pt-6">
      <HeroBannerSlider showcaseConfig={shopShowcaseConfig} showcaseReady />
      <div className={`${HOME_SECTION_STACK_CLASS} w-full min-w-0 max-lg:pb-0 lg:pb-8`}>
        <ShopShowcaseSection
          initialShowcaseData={shopShowcase}
          initialStoreSettings={storeSettings}
          skipInitialFetch
        />
        {showSecondaryBannerAt('below_small_banners') && <BannerSlider2 config={shopShowcaseConfig} />}
        {showHeroCategories ? (
          <DeferredSection minHeight={96} placeholder={<HomeCategoryRowSkeleton />}>
            <HomeCategories />
          </DeferredSection>
        ) : null}
        <LatestProducts
          initialProducts={featuredProducts.products}
          initialSectionTitle={featuredProducts.sectionTitleEn || featuredProducts.sectionTitle}
          initialSectionDescription={
            featuredProducts.sectionDescriptionEn || featuredProducts.sectionDescription
          }
          initialSectionTitleAr={featuredProducts.sectionTitleAr || ''}
          initialSectionDescriptionAr={featuredProducts.sectionDescriptionAr || ''}
          initialLayout={appearance?.homeMenuCategories}
        />
        {featuredSectionsCount === 0 && <BannerSlider config={shopShowcaseConfig} />}
        {showSecondaryBannerAt('above_top_deals') && <BannerSlider2 config={shopShowcaseConfig} />}

        <DeferredSection minHeight={320} placeholder={<HomeProductGridSkeleton count={6} />}>
          <Section3 homeSections={homeSections} sectionsLoading={false} />
        </DeferredSection>

        {showSecondaryBannerAt('below_top_deals') && <BannerSlider2 config={shopShowcaseConfig} />}

        {featuredSectionsCount > 0 && (
          <DeferredSection
            minHeight={280}
            placeholder={<HomeCategorySlidersSkeleton sections={2} />}
          >
            <Section4 />
          </DeferredSection>
        )}

        <DeferredSection minHeight={260} placeholder={<HomeExploreInterestsSkeleton productCount={6} />}>
          <CategoryInterestSection />
        </DeferredSection>
        <DeferredSection minHeight={220} placeholder={<HomeProductGridSkeleton count={6} />}>
          <RecentSearchProducts />
        </DeferredSection>
        <DeferredSection minHeight={220} placeholder={<HomeProductCarouselSkeleton count={6} />}>
          <RecommendedProducts />
        </DeferredSection>
      </div>
    </div>
  );
}
