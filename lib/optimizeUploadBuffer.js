const IMAGE_MIME_PREFIX = 'image/';
const SKIP_OPTIMIZE = new Set(['image/gif', 'image/svg+xml']);

let sharpLoader = null;

async function loadSharp() {
  if (sharpLoader === null) {
    try {
      const mod = await import('sharp');
      sharpLoader = mod.default || mod;
    } catch (error) {
      console.warn('[optimizeUploadBuffer] sharp unavailable:', error?.message || error);
      sharpLoader = false;
    }
  }
  return sharpLoader || null;
}

function extensionForContentType(contentType = '') {
  const mime = String(contentType || '').toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  return '';
}

/**
 * Compress image buffers server-side before S3 upload (handles HEIC/AVIF/TIFF, etc.).
 * Preserves transparency (PNG/WebP alpha) — never flattens to black JPEG.
 *
 * @param {object} options
 * @param {boolean} [options.forcePreserveAlpha] — always keep alpha (logos, icons)
 */
export async function optimizeUploadBuffer(buffer, {
  contentType = '',
  fileName = '',
  maxWidth = 2048,
  maxHeight = 2048,
  maxBytes = 4 * 1024 * 1024,
  quality = 85,
  forcePreserveAlpha = false,
} = {}) {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  const isImage = mime.startsWith(IMAGE_MIME_PREFIX)
    || /\.(jpe?g|png|webp|avif|heic|heif|tiff?|bmp)$/i.test(fileName);

  if (!isImage || SKIP_OPTIMIZE.has(mime) || /\.gif$/i.test(fileName)) {
    return {
      buffer,
      contentType: mime === 'image/gif' || /\.gif$/i.test(fileName) ? 'image/gif' : (mime || contentType),
      optimized: false,
    };
  }

  // Logos / transparent assets: never re-encode to JPEG (black fill on alpha).
  const looksLikePngOrWebp = mime === 'image/png'
    || mime === 'image/webp'
    || /\.(png|webp)$/i.test(fileName);

  if (
    !forcePreserveAlpha
    && buffer.length <= maxBytes
    && (mime === 'image/jpeg' || mime === 'image/webp' || mime === 'image/png')
  ) {
    return { buffer, contentType: mime || contentType, optimized: false };
  }

  // Small logo PNGs: keep original bytes untouched.
  if (forcePreserveAlpha && looksLikePngOrWebp && buffer.length <= maxBytes) {
    return {
      buffer,
      contentType: mime === 'image/webp' ? 'image/webp' : 'image/png',
      extension: mime === 'image/webp' ? 'webp' : 'png',
      optimized: false,
    };
  }

  const sharp = await loadSharp();
  if (!sharp) {
    return { buffer, contentType: mime || contentType, optimized: false };
  }

  try {
    const pipeline = sharp(buffer, { failOn: 'none' });
    const meta = await pipeline.metadata();
    const hasAlpha = forcePreserveAlpha
      || Boolean(meta.hasAlpha)
      || mime === 'image/png'
      || mime === 'image/webp'
      || /\.(png|webp)$/i.test(fileName);

    const resized = sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize(
        forcePreserveAlpha ? Math.min(maxWidth, 1200) : maxWidth,
        forcePreserveAlpha ? Math.min(maxHeight, 1200) : maxHeight,
        { fit: 'inside', withoutEnlargement: true },
      );

    if (hasAlpha) {
      // Logos: prefer PNG so email clients / older browsers keep transparency.
      if (forcePreserveAlpha) {
        const output = await resized
          .clone()
          .png({ compressionLevel: 9 })
          .toBuffer();
        return {
          buffer: output,
          contentType: 'image/png',
          extension: 'png',
          optimized: true,
        };
      }

      let output = await resized
        .clone()
        .webp({ quality, alphaQuality: 100, effort: 4 })
        .toBuffer();

      if (output.length > maxBytes) {
        output = await sharp(buffer, { failOn: 'none' })
          .rotate()
          .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 72, alphaQuality: 100, effort: 4 })
          .toBuffer();
      }

      // If still huge, fall back to PNG (keeps transparency).
      if (output.length > maxBytes) {
        output = await sharp(buffer, { failOn: 'none' })
          .rotate()
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .png({ compressionLevel: 9 })
          .toBuffer();
        return {
          buffer: output,
          contentType: 'image/png',
          extension: 'png',
          optimized: true,
        };
      }

      return {
        buffer: output,
        contentType: 'image/webp',
        extension: 'webp',
        optimized: true,
      };
    }

    let output = await resized
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    if (output.length > maxBytes) {
      output = await sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();
    }

    return {
      buffer: output,
      contentType: 'image/jpeg',
      extension: 'jpg',
      optimized: true,
    };
  } catch (error) {
    console.warn('[optimizeUploadBuffer] skipped:', error?.message || error);
    return { buffer, contentType: mime || contentType, optimized: false };
  }
}

export { extensionForContentType };
