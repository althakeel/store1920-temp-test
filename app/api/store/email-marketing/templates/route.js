import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmailTemplate from '@/models/EmailTemplate';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import {
  EMAIL_CAMPAIGN_CATEGORIES,
  EMAIL_CAMPAIGN_PRESETS,
  getEmailCampaignPresetById,
  getPresetBlocks,
  listEmailCampaignPresets,
} from '@/lib/emailCampaignPresets';
import { promotionalTemplates } from '@/lib/promotionalEmailTemplates';
import { renderEmailFromBlocks } from '@/lib/emailCampaignBuilder';
import { EMAIL_STOCK_IMAGES } from '@/lib/emailTemplateStockImages';

async function getStoreId(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.replace('Bearer ', ''));
    return authSeller(decoded.uid);
  } catch {
    return null;
  }
}

function classicPresets() {
  const fallbackImage = EMAIL_STOCK_IMAGES.weekly;
  return promotionalTemplates.map((template, index) => {
    const stockList = Object.values(EMAIL_STOCK_IMAGES);
    return {
      id: `classic:${template.id}`,
      name: template.title,
      category: 'Classic',
      subject: template.subject,
      description: template.content,
      thumbnailColor: template.color || '#0f766e',
      thumbnailImage: stockList[index % stockList.length] || fallbackImage,
      classicId: template.id,
      emoji: template.emoji,
      cta: template.cta,
    };
  });
}

export async function GET(request) {
  try {
    const storeId = await getStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const presetId = searchParams.get('presetId');
    const customId = searchParams.get('id');

    await connectDB();

    if (customId) {
      const template = await EmailTemplate.findOne({
        _id: customId,
        storeId,
        templateType: 'marketing',
      }).lean();
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, template });
    }

    if (presetId) {
      if (presetId.startsWith('classic:')) {
        const classicId = presetId.replace('classic:', '');
        const classic = promotionalTemplates.find((item) => item.id === classicId);
        if (!classic) {
          return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
        }
        return NextResponse.json({
          success: true,
          preset: {
            id: presetId,
            name: classic.title,
            category: 'Classic',
            subject: classic.subject,
            description: classic.content,
            thumbnailColor: classic.color,
            classicId,
            blocks: null,
          },
        });
      }

      const preset = getEmailCampaignPresetById(presetId);
      if (!preset) {
        return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        preset: {
          ...preset,
          blocks: getPresetBlocks(presetId),
        },
      });
    }

    const customTemplates = await EmailTemplate.find({
      storeId,
      templateType: 'marketing',
    })
      .sort({ updatedAt: -1 })
      .select('_id name subject preheader category sourcePresetId updatedAt createdAt')
      .lean();

    return NextResponse.json({
      success: true,
      categories: EMAIL_CAMPAIGN_CATEGORIES,
      presets: [...listEmailCampaignPresets(), ...classicPresets()],
      customTemplates,
      totalPresets: EMAIL_CAMPAIGN_PRESETS.length + promotionalTemplates.length,
    });
  } catch (error) {
    console.error('[email-marketing templates GET]', error);
    return NextResponse.json({ error: error.message || 'Failed to load templates' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const storeId = await getStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const name = String(body.name || '').trim();
    const subject = String(body.subject || '').trim();
    const blocks = Array.isArray(body.blocks) ? body.blocks : [];

    if (!name || !subject) {
      return NextResponse.json({ error: 'Name and subject are required' }, { status: 400 });
    }
    if (!blocks.length) {
      return NextResponse.json({ error: 'Add at least one content block' }, { status: 400 });
    }

    await connectDB();

    const html = renderEmailFromBlocks(blocks, {
      products: [],
      recipientEmail: '',
      preheader: String(body.preheader || '').trim(),
      fontFamily: String(body.fontFamily || 'helvetica').trim() || 'helvetica',
    });

    const template = await EmailTemplate.create({
      storeId,
      templateType: 'marketing',
      name,
      subject,
      preheader: String(body.preheader || '').trim(),
      fontFamily: String(body.fontFamily || 'helvetica').trim() || 'helvetica',
      template: html,
      blocks,
      category: String(body.category || 'Custom').trim() || 'Custom',
      sourcePresetId: String(body.sourcePresetId || '').trim(),
    });

    return NextResponse.json({ success: true, template }, { status: 201 });
  } catch (error) {
    console.error('[email-marketing templates POST]', error);
    return NextResponse.json({ error: error.message || 'Failed to save template' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const storeId = await getStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const id = body.id;
    if (!id) {
      return NextResponse.json({ error: 'Template id is required' }, { status: 400 });
    }

    await connectDB();

    const template = await EmailTemplate.findOne({
      _id: id,
      storeId,
      templateType: 'marketing',
    });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (body.name != null) template.name = String(body.name).trim();
    if (body.subject != null) template.subject = String(body.subject).trim();
    if (body.preheader != null) template.preheader = String(body.preheader).trim();
    if (body.fontFamily != null) template.fontFamily = String(body.fontFamily).trim() || 'helvetica';
    if (body.category != null) template.category = String(body.category).trim() || 'Custom';
    if (Array.isArray(body.blocks)) {
      template.blocks = body.blocks;
      template.template = renderEmailFromBlocks(body.blocks, {
        products: [],
        recipientEmail: '',
        preheader: template.preheader || '',
        fontFamily: template.fontFamily || 'helvetica',
      });
    }
    template.updatedAt = new Date();
    await template.save();

    return NextResponse.json({ success: true, template });
  } catch (error) {
    console.error('[email-marketing templates PUT]', error);
    return NextResponse.json({ error: error.message || 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const storeId = await getStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Template id is required' }, { status: 400 });
    }

    await connectDB();
    const deleted = await EmailTemplate.findOneAndDelete({
      _id: id,
      storeId,
      templateType: 'marketing',
    });
    if (!deleted) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[email-marketing templates DELETE]', error);
    return NextResponse.json({ error: error.message || 'Failed to delete template' }, { status: 500 });
  }
}
