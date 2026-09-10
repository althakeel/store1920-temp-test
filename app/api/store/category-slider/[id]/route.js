import dbConnect from '@/lib/mongodb';
import CategorySlider from '@/models/CategorySlider';
import { NextResponse } from 'next/server';
import { invalidateCategorySliderCaches } from '@/lib/categorySliderCache';
import { resolveCategorySliderAccess, buildCategorySliderFilter } from '@/lib/categorySliderAccess';
import { normalizeCategorySliderBackground, normalizeCategorySliderSideImagePosition, normalizeCategorySliderAutoSlide, normalizeCategorySliderAutoSlideInterval } from '@/lib/categorySliderTheme';

function parseAuthHeader(req) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth) return null;
  const parts = auth.split(' ');
  return parts.length === 2 ? parts[1] : null;
}

async function resolveStoreScope(token) {
  return resolveCategorySliderAccess(token);
}

export async function PUT(req, { params }) {
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

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Slider ID is required' }, { status: 400 });
    }

    const { title, subtitle, titleAr, subtitleAr, productIds, sideImage, sideImagePosition, cardsPerRow, backgroundColor, autoSlide, autoSlideIntervalMs } = await req.json();
    console.log('=== 💾 PUT SLIDER START ===');
    console.log('💾 Received ID:', id);
    console.log('💾 Received title:', title);
    console.log('💾 Received subtitle:', JSON.stringify(subtitle), 'Type:', typeof subtitle);
    console.log('💾 Received productIds:', productIds);

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    const productIdsValue = Array.isArray(productIds)
      ? productIds.map((productId) => String(productId)).filter(Boolean)
      : [];

    if (productIdsValue.length === 0) {
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

    const updateData = {
      title: title.trim(),
      subtitle: subtitleValue,
      titleAr: titleAr !== undefined && titleAr !== null ? String(titleAr).trim() : '',
      subtitleAr: subtitleAr !== undefined && subtitleAr !== null ? String(subtitleAr).trim() : '',
      productIds: productIdsValue,
      sideImage: sideImageValue,
      sideImagePosition: normalizeCategorySliderSideImagePosition(sideImagePosition),
      cardsPerRow: Number(cardsPerRow) === 5 ? 5 : 6,
      backgroundColor: normalizeCategorySliderBackground(backgroundColor),
      autoSlide: normalizeCategorySliderAutoSlide(autoSlide),
      autoSlideIntervalMs: normalizeCategorySliderAutoSlideInterval(autoSlideIntervalMs),
    };

    console.log('💾 About to update with:', JSON.stringify(updateData));

    const slider = await CategorySlider.findOneAndUpdate(
      buildCategorySliderFilter(id, scope),
      { $set: scope.isAdmin ? updateData : { ...updateData, storeId: scope.storeId } },
      { new: true, runValidators: true }
    );

    console.log('💾 After update, subtitle:', JSON.stringify(slider?.subtitle));
    console.log('=== 💾 PUT SLIDER END ===');

    if (!slider) {
      return NextResponse.json(
        { error: 'Slider not found' },
        { status: 404 }
      );
    }

    // Ensure response includes all fields as plain object
    const sliderData = slider.toObject ? slider.toObject() : slider;
    console.log('💾 Returning slider data, backgroundColor:', sliderData.backgroundColor);

    invalidateCategorySliderCaches();

    return NextResponse.json(
      {
        message: 'Slider updated',
        slider: {
          ...sliderData,
          backgroundColor: normalizeCategorySliderBackground(sliderData.backgroundColor),
          autoSlide: normalizeCategorySliderAutoSlide(sliderData.autoSlide),
          autoSlideIntervalMs: normalizeCategorySliderAutoSlideInterval(sliderData.autoSlideIntervalMs),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating category slider:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update slider' },
      { status: 500 }
    );
  }
}

export async function DELETE(req, { params }) {
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

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Slider ID is required' }, { status: 400 });
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
