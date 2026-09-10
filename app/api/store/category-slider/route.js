import dbConnect from '@/lib/mongodb';
import CategorySlider from '@/models/CategorySlider';
import { NextResponse } from 'next/server';
import { invalidateCategorySliderCaches } from '@/lib/categorySliderCache';
import { resolveCategorySliderAccess, buildCategorySliderFilter } from '@/lib/categorySliderAccess';
import { normalizeCategorySliderBackground, normalizeCategorySliderSideImagePosition, normalizeCategorySliderAutoSlide, normalizeCategorySliderAutoSlideInterval } from '@/lib/categorySliderTheme';
import { sortCategorySliders, backfillCategorySliderSortOrdersIfNeeded } from '@/lib/categorySliderOrder';

function parseAuthHeader(req) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth) return null;
  const parts = auth.split(' ');
  return parts.length === 2 ? parts[1] : null;
}

async function resolveStoreScope(token) {
  return resolveCategorySliderAccess(token);
}

export async function GET(req) {
  try {
    await dbConnect();
    const token = parseAuthHeader(req);

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveStoreScope(token);
    if (!scope) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    await backfillCategorySliderSortOrdersIfNeeded(CategorySlider);

    const sliders = sortCategorySliders(
      await CategorySlider.find({ storeId: { $in: scope.storeIds } }).lean()
    );
    
    // Ensure all fields including subtitle are present
    const slidersWithDefaults = sliders.map(slider => ({
      ...slider,
      subtitle: slider.subtitle || '',
      titleAr: slider.titleAr || '',
      subtitleAr: slider.subtitleAr || '',
      sideImage: slider.sideImage || '',
      sideImagePosition: normalizeCategorySliderSideImagePosition(slider.sideImagePosition),
      cardsPerRow: slider.cardsPerRow === 5 ? 5 : 6,
      backgroundColor: normalizeCategorySliderBackground(slider.backgroundColor),
      autoSlide: normalizeCategorySliderAutoSlide(slider.autoSlide),
      autoSlideIntervalMs: normalizeCategorySliderAutoSlideInterval(slider.autoSlideIntervalMs),
      sortOrder: Number.isFinite(Number(slider.sortOrder)) ? Number(slider.sortOrder) : 0,
    }));
    
    console.log('📊 API returning sliders:', slidersWithDefaults);

    return NextResponse.json({ sliders: slidersWithDefaults }, { status: 200 });
  } catch (error) {
    console.error('Error fetching category sliders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sliders' },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    await dbConnect();
    const token = parseAuthHeader(req);
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveStoreScope(token);
    if (!scope) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const { title, subtitle, titleAr, subtitleAr, productIds, sideImage, sideImagePosition, cardsPerRow, backgroundColor, autoSlide, autoSlideIntervalMs } = await req.json();
    console.log('=== 💾 POST SLIDER START ===');
    console.log('💾 Raw request body - subtitle:', subtitle);
    console.log('💾 Subtitle is null:', subtitle === null);
    console.log('💾 Subtitle is undefined:', subtitle === undefined);
    console.log('💾 Subtitle is empty string:', subtitle === '');
    console.log('💾 Subtitle type:', typeof subtitle);
    console.log('💾 Subtitle length:', subtitle?.length);
    console.log('💾 Received title:', title);
    console.log('💾 Received productIds count:', productIds?.length);

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one product is required' },
        { status: 400 }
      );
    }

    // Explicitly handle subtitle - ensure it's a string
    const subtitleValue = subtitle !== undefined && subtitle !== null ? String(subtitle).trim() : '';
    console.log('💾 Processed subtitle value:', JSON.stringify(subtitleValue), 'Length:', subtitleValue.length);

    const sideImageValue = sideImage !== undefined && sideImage !== null
      ? String(sideImage).trim()
      : '';

    if (!scope.storeId) {
      return NextResponse.json(
        { error: 'No store associated with this account' },
        { status: 403 }
      );
    }

    const lastSlider = await CategorySlider.findOne()
      .sort({ sortOrder: -1 })
      .select('sortOrder')
      .lean();
    const nextSortOrder = (Number.isFinite(Number(lastSlider?.sortOrder)) ? Number(lastSlider.sortOrder) : -1) + 1;

    const sliderData = {
      storeId: scope.storeId,
      title: title.trim(),
      subtitle: subtitleValue,
      titleAr: titleAr !== undefined && titleAr !== null ? String(titleAr).trim() : '',
      subtitleAr: subtitleAr !== undefined && subtitleAr !== null ? String(subtitleAr).trim() : '',
      productIds,
      sideImage: sideImageValue,
      sideImagePosition: normalizeCategorySliderSideImagePosition(sideImagePosition),
      cardsPerRow: Number(cardsPerRow) === 5 ? 5 : 6,
      backgroundColor: normalizeCategorySliderBackground(backgroundColor),
      autoSlide: normalizeCategorySliderAutoSlide(autoSlide),
      autoSlideIntervalMs: normalizeCategorySliderAutoSlideInterval(autoSlideIntervalMs),
      sortOrder: nextSortOrder,
    };
    console.log('💾 About to save with:', JSON.stringify(sliderData));

    const slider = new CategorySlider(sliderData);
    await slider.save();
    
    invalidateCategorySliderCaches();

    const savedData = slider.toObject ? slider.toObject() : slider;
    console.log('💾 Saved to DB, backgroundColor:', savedData.backgroundColor);
    console.log('=== 💾 POST SLIDER END ===');

    return NextResponse.json(
      { message: 'Slider created', slider: { ...savedData, backgroundColor: normalizeCategorySliderBackground(savedData.backgroundColor) } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating category slider:', error);
    return NextResponse.json(
      { error: 'Failed to create slider' },
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  try {
    await dbConnect();
    const token = parseAuthHeader(req);
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveStoreScope(token);
    if (!scope) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    // Get ID from query parameter
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Slider ID is required' },
        { status: 400 }
      );
    }

    const slider = await CategorySlider.findOneAndDelete(
      buildCategorySliderFilter(id, scope),
    );

    if (!slider) {
      return NextResponse.json(
        { error: 'Slider not found' },
        { status: 404 }
      );
    }

    invalidateCategorySliderCaches();

    return NextResponse.json(
      { message: 'Slider deleted' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting category slider:', error);
    return NextResponse.json(
      { error: 'Failed to delete slider' },
      { status: 500 }
    );
  }
}
