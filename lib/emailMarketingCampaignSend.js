import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Product from '@/models/Product';
import EmailHistory from '@/models/EmailHistory';
import EmailTemplate from '@/models/EmailTemplate';
import { sendMail } from '@/lib/email';
import { getTemplateById } from '@/lib/promotionalEmailTemplates';
import { withBrandEmailLogo } from '@/lib/brandLogo';
import { renderEmailFromBlocks } from '@/lib/emailCampaignBuilder';
import { getCustomerSiteUrl } from '@/lib/appUrl';

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

async function resolveRecipients(customerEmails = []) {
  const uniqueEmails = Array.from(
    new Set(
      (customerEmails || [])
        .map((email) => String(email || '').trim().toLowerCase())
        .filter((email) => email.includes('@')),
    ),
  );

  if (!uniqueEmails.length) return [];

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

async function resolveRender(campaign, products) {
  const blocks = Array.isArray(campaign.blocks) ? campaign.blocks : [];
  const subject = campaign.subject || 'A message from Store1920';
  const preheader = campaign.preheader || '';

  if (blocks.length) {
    return {
      id: campaign.customTemplateId || campaign.templateId || String(campaign._id),
      subject,
      render: (recipientEmail) => renderEmailFromBlocks(blocks, {
        products,
        recipientEmail,
        preheader,
      }),
    };
  }

  if (campaign.customTemplateId) {
    const saved = await EmailTemplate.findById(campaign.customTemplateId).lean();
    if (saved?.templateType === 'marketing') {
      const savedBlocks = Array.isArray(saved.blocks) ? saved.blocks : [];
      return {
        id: String(saved._id),
        subject: subject || saved.subject,
        render: (recipientEmail) => (
          savedBlocks.length
            ? renderEmailFromBlocks(savedBlocks, {
              products,
              recipientEmail,
              preheader: preheader || saved.preheader || '',
            })
            : (saved.template || '')
        ),
      };
    }
  }

  const templateId = String(campaign.templateId || '');
  const classicId = templateId.startsWith('classic:')
    ? templateId.replace('classic:', '')
    : templateId;
  const classic = getTemplateById(classicId);
  if (classic) {
    return {
      id: classic.id,
      subject: subject || classic.subject,
      render: (recipientEmail) => classic.template(products, recipientEmail),
    };
  }

  throw new Error('Campaign has no renderable template content');
}

/**
 * Send one campaign slot to its saved customer email list.
 */
export async function sendEmailMarketingCampaign(campaign, { slotKey = '' } = {}) {
  await connectDB();

  const products = await loadFeaturedProducts();
  const content = await resolveRender(campaign, products);
  const customers = await resolveRecipients(campaign.customerEmails || []);

  if (!customers.length) {
    return { emailsSent: 0, emailsFailed: 0, totalCustomers: 0, results: [] };
  }

  const storeId = campaign.storeId;
  const results = [];

  for (const customer of customers) {
    try {
      const htmlContent = withBrandEmailLogo(content.render(customer.email));
      const customerFirstName = customer.name ? String(customer.name).split(' ')[0] : 'there';
      const personalizedSubject = `HEY ${customerFirstName.toUpperCase()}! ${content.subject}`;

      await sendMail({
        to: customer.email,
        subject: personalizedSubject,
        html: htmlContent,
        storeId: storeId?.toString?.() || storeId,
        fromType: 'marketing',
        tags: [{ name: 'category', value: 'promotional' }],
        headers: {
          'List-Unsubscribe': `<${getCustomerSiteUrl()}/settings?unsubscribe=promotional&email=${encodeURIComponent(customer.email)}>`,
          'X-Campaign': content.id,
          'X-Marketing-Campaign': String(campaign._id || ''),
          ...(slotKey ? { 'X-Campaign-Slot': slotKey } : {}),
          ...(campaign.audience ? { 'X-Audience': String(campaign.audience) } : {}),
        },
      });

      if (storeId) {
        await EmailHistory.create({
          storeId,
          type: 'promotional',
          recipientEmail: customer.email,
          recipientName: customer.name || 'Customer',
          subject: personalizedSubject,
          status: 'sent',
          customMessage: `campaign:${campaign._id}|slot:${slotKey}|template:${content.id}|audience:${campaign.audience || 'all'}`,
          sentAt: new Date(),
        }).catch(() => {});
      }

      results.push({ email: customer.email, status: 'sent' });
      await new Promise((resolve) => setTimeout(resolve, 600));
    } catch (error) {
      if (storeId) {
        await EmailHistory.create({
          storeId,
          type: 'promotional',
          recipientEmail: customer.email,
          recipientName: customer.name || 'Customer',
          subject: content.subject,
          status: 'failed',
          errorMessage: error.message || 'Unknown error',
          customMessage: `campaign:${campaign._id}|slot:${slotKey}`,
          sentAt: new Date(),
        }).catch(() => {});
      }
      results.push({ email: customer.email, status: 'failed', error: error.message });
    }
  }

  return {
    emailsSent: results.filter((row) => row.status === 'sent').length,
    emailsFailed: results.filter((row) => row.status === 'failed').length,
    totalCustomers: customers.length,
    results,
  };
}
