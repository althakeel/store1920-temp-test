import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Product from '@/models/Product';
import Store from '@/models/Store';
import EmailHistory from '@/models/EmailHistory';
import EmailTemplate from '@/models/EmailTemplate';
import { sendMail } from '@/lib/email';
import { getRandomTemplate, getTemplateById, getAllTemplateIds } from '@/lib/promotionalEmailTemplates';
import { withBrandEmailLogo } from '@/lib/brandLogo';
import { renderEmailFromBlocks } from '@/lib/emailCampaignBuilder';
import { getCustomerSiteUrl } from '@/lib/appUrl';
import mongoose from 'mongoose';

function mapProducts(featuredProducts = []) {
  return featuredProducts.map((p) => ({
    id: p._id.toString(),
    slug: p.slug,
    name: p.name,
    description: p.description || '',
    category: p.category || 'Product',
    price: p.price,
    originalPrice: p.AED || p.mrp || null,
    image: p.images && p.images[0] ? p.images[0] : null,
    images: p.images || [],
    stock: p.stockQuantity || 0,
  }));
}

async function loadFeaturedProducts() {
  const featuredProducts = await Product.find({
    inStock: true,
    stockQuantity: { $gt: 0 },
  })
    .sort({ createdAt: -1 })
    .limit(4)
    .select('_id name slug price mrp AED images description category stockQuantity')
    .lean();
  return mapProducts(featuredProducts);
}

async function resolveRecipients(customerEmails, limit = 50) {
  if (customerEmails && Array.isArray(customerEmails) && customerEmails.length > 0) {
    const uniqueEmails = Array.from(
      new Set(
        customerEmails
          .map((email) => String(email || '').trim().toLowerCase())
          .filter((email) => email.includes('@')),
      ),
    );

    const users = await User.find({
      email: { $in: uniqueEmails },
      'emailPreferences.promotional': { $ne: false },
    })
      .select('email name')
      .lean();

    const userByEmail = new Map(
      users.map((user) => [String(user.email || '').trim().toLowerCase(), user]),
    );

    const optedOut = await User.find({
      email: { $in: uniqueEmails },
      'emailPreferences.promotional': false,
    })
      .select('email')
      .lean();
    const optedOutSet = new Set(
      optedOut.map((user) => String(user.email || '').trim().toLowerCase()),
    );

    return uniqueEmails
      .filter((email) => !optedOutSet.has(email))
      .map((email) => {
        const user = userByEmail.get(email);
        return {
          email,
          name: user?.name || email.split('@')[0] || 'Customer',
        };
      });
  }

  return User.find({
    email: { $exists: true, $ne: null, $ne: '' },
    'emailPreferences.promotional': { $ne: false },
  })
    .limit(limit)
    .select('email name')
    .lean();
}

async function resolveCampaignContent(body, products) {
  const {
    templateId,
    customTemplateId,
    blocks,
    subject: customSubject,
    preheader = '',
    fontFamily = '',
  } = body;

  if (Array.isArray(blocks) && blocks.length > 0) {
    const font = fontFamily || 'helvetica';
    return {
      id: customTemplateId || templateId || 'custom-blocks',
      subject: customSubject || 'A message from Store1920',
      preheader,
      render: (recipientEmail) => renderEmailFromBlocks(blocks, {
        products,
        recipientEmail,
        preheader,
        fontFamily: font,
      }),
    };
  }

  if (customTemplateId) {
    const saved = await EmailTemplate.findById(customTemplateId).lean();
    if (!saved || saved.templateType !== 'marketing') {
      return null;
    }
    const savedBlocks = Array.isArray(saved.blocks) ? saved.blocks : [];
    const font = fontFamily || saved.fontFamily || 'helvetica';
    return {
      id: String(saved._id),
      subject: customSubject || saved.subject,
      preheader: preheader || saved.preheader || '',
      render: (recipientEmail) => (
        savedBlocks.length
          ? renderEmailFromBlocks(savedBlocks, {
            products,
            recipientEmail,
            preheader: preheader || saved.preheader || '',
            fontFamily: font,
          })
          : (saved.template || '')
      ),
    };
  }

  if (templateId && String(templateId).startsWith('classic:')) {
    const classicId = String(templateId).replace('classic:', '');
    const classic = getTemplateById(classicId);
    if (!classic) return null;
    return {
      id: classic.id,
      subject: customSubject || classic.subject,
      preheader,
      render: (recipientEmail) => classic.template(products, recipientEmail),
    };
  }

  if (templateId && !String(templateId).startsWith('preset:')) {
    const classic = getTemplateById(templateId);
    if (classic) {
      return {
        id: classic.id,
        subject: customSubject || classic.subject,
        preheader,
        render: (recipientEmail) => classic.template(products, recipientEmail),
      };
    }
  }

  const template = getRandomTemplate();
  return {
    id: template.id,
    subject: customSubject || template.subject,
    preheader,
    render: (recipientEmail) => template.template(products, recipientEmail),
  };
}

export async function GET() {
  try {
    const template = getRandomTemplate();
    await connectDB();
    const storeObjectId = await resolveStoreObjectId();
    const customers = await resolveRecipients(null, 50);
    if (!customers.length) {
      return NextResponse.json({ success: false, message: 'No customers found with valid emails' }, { status: 404 });
    }

    const products = await loadFeaturedProducts();
    const results = [];

    for (const customer of customers) {
      try {
        const htmlContent = withBrandEmailLogo(template.template(products, customer.email));
        const customerFirstName = customer.name ? customer.name.split(' ')[0] : 'there';
        const personalizedSubject = `HEY ${customerFirstName.toUpperCase()}! ${template.subject}`;

        await sendMail({
          to: customer.email,
          subject: personalizedSubject,
          html: htmlContent,
          storeId: storeObjectId?.toString(),
          fromType: 'marketing',
          tags: [{ name: 'category', value: 'promotional' }],
          headers: {
            'List-Unsubscribe': `<${getCustomerSiteUrl()}/settings?unsubscribe=promotional&email=${encodeURIComponent(customer.email)}>`,
            'X-Campaign': template.id,
          },
        });

        if (storeObjectId) {
          await EmailHistory.create({
            storeId: storeObjectId,
            type: 'promotional',
            recipientEmail: customer.email,
            recipientName: customer.name || 'Customer',
            subject: personalizedSubject,
            status: 'sent',
            customMessage: `template:${template.id}`,
            sentAt: new Date(),
          }).catch(() => {});
        }

        results.push({ email: customer.email, status: 'sent', template: template.id });
        await new Promise((resolve) => setTimeout(resolve, 600));
      } catch (error) {
        if (storeObjectId) {
          await EmailHistory.create({
            storeId: storeObjectId,
            type: 'promotional',
            recipientEmail: customer.email,
            recipientName: customer.name || 'Customer',
            subject: template.subject,
            status: 'failed',
            errorMessage: error.message || 'Unknown error',
            customMessage: `template:${template.id}`,
            sentAt: new Date(),
          }).catch(() => {});
        }
        results.push({ email: customer.email, status: 'failed', error: error.message });
      }
    }

    return NextResponse.json({
      success: true,
      template: { id: template.id, subject: template.subject },
      totalCustomers: customers.length,
      emailsSent: results.filter((r) => r.status === 'sent').length,
      emailsFailed: results.filter((r) => r.status === 'failed').length,
      results: process.env.NODE_ENV === 'development' ? results : undefined,
    });
  } catch (error) {
    console.error('Error sending promotional emails:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { customerEmails, limit = 50, audience = null } = body;

    await connectDB();
    const storeObjectId = await resolveStoreObjectId();
    const products = await loadFeaturedProducts();
    const campaign = await resolveCampaignContent(body, products);

    if (!campaign) {
      return NextResponse.json({
        success: false,
        error: 'Template not found',
        availableTemplates: getAllTemplateIds(),
      }, { status: 400 });
    }

    const customers = await resolveRecipients(customerEmails, limit);
    if (!customers.length) {
      return NextResponse.json({ success: false, message: 'No customers found' }, { status: 404 });
    }

    const results = [];
    for (const customer of customers) {
      try {
        const htmlContent = withBrandEmailLogo(campaign.render(customer.email));
        const customerFirstName = customer.name ? String(customer.name).split(' ')[0] : 'there';
        const personalizedSubject = `HEY ${customerFirstName.toUpperCase()}! ${campaign.subject}`;

        await sendMail({
          to: customer.email,
          subject: personalizedSubject,
          html: htmlContent,
          storeId: storeObjectId?.toString(),
          fromType: 'marketing',
          tags: [{ name: 'category', value: 'promotional' }],
          headers: {
            'List-Unsubscribe': `<${getCustomerSiteUrl()}/settings?unsubscribe=promotional&email=${encodeURIComponent(customer.email)}>`,
            'X-Campaign': campaign.id,
            ...(audience ? { 'X-Audience': String(audience) } : {}),
          },
        });

        if (storeObjectId) {
          await EmailHistory.create({
            storeId: storeObjectId,
            type: 'promotional',
            recipientEmail: customer.email,
            recipientName: customer.name || 'Customer',
            subject: personalizedSubject,
            status: 'sent',
            customMessage: `template:${campaign.id}${audience ? `|audience:${audience}` : ''}`,
            sentAt: new Date(),
          }).catch(() => {});
        }

        results.push({ email: customer.email, status: 'sent', template: campaign.id });
        await new Promise((resolve) => setTimeout(resolve, 600));
      } catch (error) {
        if (storeObjectId) {
          await EmailHistory.create({
            storeId: storeObjectId,
            type: 'promotional',
            recipientEmail: customer.email,
            recipientName: customer.name || 'Customer',
            subject: campaign.subject,
            status: 'failed',
            errorMessage: error.message || 'Unknown error',
            customMessage: `template:${campaign.id}`,
            sentAt: new Date(),
          }).catch(() => {});
        }
        results.push({ email: customer.email, status: 'failed', error: error.message });
      }
    }

    return NextResponse.json({
      success: true,
      template: { id: campaign.id, subject: campaign.subject },
      audience: audience || null,
      totalCustomers: customers.length,
      emailsSent: results.filter((r) => r.status === 'sent').length,
      emailsFailed: results.filter((r) => r.status === 'failed').length,
      results: process.env.NODE_ENV === 'development' ? results : undefined,
    });
  } catch (error) {
    console.error('Error sending promotional emails:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

async function resolveStoreObjectId() {
  const envStoreId = process.env.PROMOTIONAL_STORE_ID;
  let storeId = envStoreId;
  if (!storeId) {
    const store = await Store.findOne({}).select('_id').lean();
    storeId = store?._id?.toString();
  }
  if (!storeId) return null;
  return new mongoose.Types.ObjectId(storeId);
}
