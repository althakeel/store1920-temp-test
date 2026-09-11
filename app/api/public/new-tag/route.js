import { NextResponse } from 'next/server';
import { DEFAULT_NEW_TAG_SETTINGS } from '@/lib/newProductTag';
import { getPublicNewTagSettings } from '@/lib/storeNewTagSettings';

export async function GET() {
  try {
    const settings = await getPublicNewTagSettings();
    return NextResponse.json(settings, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('[public/new-tag] failed to load settings:', error);
    return NextResponse.json(DEFAULT_NEW_TAG_SETTINGS);
  }
}
