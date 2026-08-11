import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { downloadRemoteImageForMirror } from '@/lib/productImageSource'

const DEFAULT_REGION = 'ap-south-1';
const DEFAULT_BUCKET = 'store1920-images';
const DEFAULT_PUBLIC_URL = 'https://store1920-images.s3.ap-south-1.amazonaws.com';

const ALLOWED_FOLDERS = new Set(['products', 'categories', 'brands', 'uploads']);

let _client = null;

export function ensureS3Configured() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.AWS_S3_BUCKET || DEFAULT_BUCKET;
  const region = process.env.AWS_REGION || DEFAULT_REGION;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'S3 is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, and AWS_REGION.'
    );
  }

  return { accessKeyId, secretAccessKey, bucket, region };
}

function getClient() {
  if (_client) return _client;

  const { accessKeyId, secretAccessKey, region } = ensureS3Configured();
  // WHEN_REQUIRED avoids flexible checksum query params on presigned PUTs
  // (browsers cannot send x-amz-checksum-* and CORS preflight then fails).
  _client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  return _client;
}

export function getS3PublicBaseUrl() {
  return String(process.env.AWS_S3_PUBLIC_URL || DEFAULT_PUBLIC_URL).replace(/\/+$/, '');
}

export function buildPublicUrl(key = '') {
  const base = getS3PublicBaseUrl();
  const normalizedKey = String(key || '').replace(/^\/+/, '');
  return normalizedKey ? `${base}/${normalizedKey}` : base;
}

function guessContentType(fileName = '') {
  const ext = String(fileName).split('.').pop()?.toLowerCase();
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
  };
  return map[ext] || 'application/octet-stream';
}

export function normalizeFolder(folder = 'uploads') {
  const cleaned = String(folder || 'uploads').replace(/^\/+|\/+$/g, '');

  if (ALLOWED_FOLDERS.has(cleaned)) {
    return cleaned;
  }

  const lower = cleaned.toLowerCase();

  if (lower.startsWith('products')) return 'products';
  if (lower.startsWith('categories') || lower.includes('categor')) return 'categories';
  if (lower.startsWith('brands') || lower.startsWith('stores/logos') || lower === 'logos') {
    return 'brands';
  }
  if (lower.startsWith('reviews') || lower.startsWith('returns') || lower.startsWith('uploads') || lower.startsWith('store/') || lower.includes('profile')) {
    return 'uploads';
  }

  return 'uploads';
}

function sanitizeFileName(fileName = '') {
  const base = String(fileName || `file_${Date.now()}`).split(/[/\\]/).pop() || `file_${Date.now()}`;
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function uploadToS3({ buffer, fileName, folder = 'uploads', contentType }) {
  const { bucket } = ensureS3Configured();
  const client = getClient();
  const safeFolder = normalizeFolder(folder);
  const safeName = sanitizeFileName(fileName);
  const key = `${safeFolder}/${safeName}`.replace(/\/+/g, '/');
  const resolvedContentType = contentType || guessContentType(safeName);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: resolvedContentType,
    })
  );

  return { url: buildPublicUrl(key), key };
}

export async function createPresignedUploadUrl({
  fileName,
  folder = 'uploads',
  contentType,
  expiresIn = 300,
}) {
  const { bucket } = ensureS3Configured();
  const client = getClient();
  const safeFolder = normalizeFolder(folder);
  const safeName = sanitizeFileName(fileName);
  const key = `${safeFolder}/${safeName}`.replace(/\/+/g, '/');
  const resolvedContentType = contentType || guessContentType(safeName);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: resolvedContentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });

  return {
    uploadUrl,
    publicUrl: buildPublicUrl(key),
    key,
    contentType: resolvedContentType,
  };
}

export async function mirrorRemoteImageToS3(imageUrl, { folder = 'categories', fileName, minWidth = 0 }) {
  const download = await downloadRemoteImageForMirror(imageUrl, { minWidth })
  const baseName = fileName
    ? String(fileName).replace(/\.[^.]+$/, '')
    : `image-${Date.now()}`
  const resolvedFileName = `${baseName}.${download.extension}`

  return uploadToS3({
    buffer: download.buffer,
    fileName: resolvedFileName,
    folder,
    contentType: download.contentType || guessContentType(resolvedFileName),
  })
}

export function isHostedMediaUrl(url = '') {
  const value = String(url || '').trim();
  if (!/^https?:\/\//i.test(value)) return false;
  return value.startsWith(getS3PublicBaseUrl());
}
