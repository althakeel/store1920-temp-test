import fs from 'fs';
import path from 'path';
import {
  STORE1920_EMAIL_LOGO_CID,
  STORE1920_LOGO_URL,
  ensureEmailHtmlHasLogo,
} from '@/lib/brandLogo';
import { ensureEmailPageLayout } from '@/lib/transactionalEmailLayout';

const EMAIL_LOGO_FILE_CANDIDATES = [
  path.join(process.cwd(), 'public', 'logo', 'Store1920.png'),
  path.join(process.cwd(), 'assets', 'logo', 'Store1920.png'),
];

export function getEmailLogoFilePath() {
  for (const candidate of EMAIL_LOGO_FILE_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function getEmailLogoAttachment() {
  const filePath = getEmailLogoFilePath();
  if (!filePath) return null;

  return {
    filename: 'Store1920.png',
    path: filePath,
    cid: STORE1920_EMAIL_LOGO_CID,
  };
}

export function getEmailLogoResendAttachment() {
  const filePath = getEmailLogoFilePath();
  if (!filePath) return null;

  return {
    filename: 'Store1920.png',
    content: fs.readFileSync(filePath).toString('base64'),
    content_id: STORE1920_EMAIL_LOGO_CID,
  };
}

export function getMailjetInlineAttachment() {
  const filePath = getEmailLogoFilePath();
  if (!filePath) return null;

  return {
    ContentType: 'image/png',
    Filename: 'Store1920.png',
    ContentID: STORE1920_EMAIL_LOGO_CID,
    Base64Content: fs.readFileSync(filePath).toString('base64'),
  };
}

function normalizeEmailLogoSrc(html = '') {
  if (typeof html !== 'string') return html;

  const cidPattern = new RegExp(`cid:${STORE1920_EMAIL_LOGO_CID}`, 'gi');
  return html
    .replace(cidPattern, STORE1920_LOGO_URL)
    .replace(/src="https?:\/\/[^"]*\/logo\/Store1920\.png"/gi, `src="${STORE1920_LOGO_URL}"`);
}

export function withEmbeddedEmailLogo(html = '', { injectMissingLogo = true } = {}) {
  // Marketing/campaign HTML is designed in Email Marketing — send it unchanged.
  // Do not inject a logo, wrap in the transactional shell, or rewrite image srcs.
  if (!injectMissingLogo) {
    return {
      html: typeof html === 'string' ? html : '',
      attachments: [],
      mailjetInline: null,
      resendAttachment: null,
    };
  }

  const htmlWithLogo = ensureEmailHtmlHasLogo(html);
  const htmlWithLayout = ensureEmailPageLayout(htmlWithLogo);

  // Hosted logo URL is more reliable than CID inline attachments in Gmail/Outlook.
  // CID mismatches show a broken header image and the PNG as a separate attachment.
  return {
    html: normalizeEmailLogoSrc(htmlWithLayout),
    attachments: [],
    mailjetInline: null,
    resendAttachment: null,
  };
}
