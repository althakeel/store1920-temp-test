import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import axios from 'axios';
import connectDB from '@/lib/mongodb';
import Category from '@/models/Category';
import StoreMenu from '@/models/StoreMenu';
import authAdmin from '@/middlewares/authAdmin';
import { resolveStoreAccess } from '@/lib/storeAccess';
import { cleanDisplayText } from '@/lib/displayText';
import { invalidateCategoryCaches } from '@/lib/categoryCache';

import { getS3PublicBaseUrl, isHostedMediaUrl, mirrorRemoteImageToS3 } from '@/lib/storage';
import { normalizeRemoteProductImageUrl } from '@/lib/productImageSource';
import { toPublicCategoryPath } from '@/lib/categorySlug';

const S3_PUBLIC_URL = getS3PublicBaseUrl();

const slugify = (value = '') =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const normalizeText = (value) => cleanDisplayText(String(value || '').replace(/\r\n/g, '\n'));

const normalizeLookupValue = (value = '') => String(value || '').trim().toLowerCase();

const buildNameParentKey = (name = '', parentId = null) => `${normalizeLookupValue(name)}::${String(parentId || '')}`;

const buildCategoryUrl = (name = '', slug = '') => toPublicCategoryPath(slug || name);

const parseBoolean = (value, fallback = false) => {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'menu', 'show', 'visible'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'hide', 'hidden'].includes(normalized)) return false;
  return fallback;
};

const getFirstPresentValue = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }

  return '';
};

const splitHierarchyPath = (value = '') => String(value || '')
  .split(/\s*(?:>|›|»|→|\|)\s*/)
  .map((segment) => String(segment || '').trim())
  .filter(Boolean);

const getHierarchySegmentsFromRow = (row = {}) => {
  const pathValue = getFirstPresentValue(
    row['Category Path'],
    row.categoryPath,
    row.Path,
    row.path,
    row.Hierarchy,
    row.hierarchy,
    row.Breadcrumb,
    row.breadcrumb,
    row['Full Path'],
    row.fullPath,
    row.Tree,
    row.tree
  );

  if (String(pathValue || '').trim()) {
    return splitHierarchyPath(pathValue);
  }

  return [
    getFirstPresentValue(row['Main Category'], row.mainCategory, row['Level 1'], row.level1, row['Category Level 1'], row.categoryLevel1),
    getFirstPresentValue(row.Subcategory, row['Subcategory 1'], row.subcategory, row.subcategory1, row['Sub Category'], row.subCategory, row['Level 2'], row.level2, row['Category Level 2'], row.categoryLevel2),
    getFirstPresentValue(row['Sub Subcategory'], row.subSubcategory, row['Sub Sub Category'], row.subSubCategory, row['Subcategory 2'], row.subcategory2, row['Level 3'], row.level3, row['Category Level 3'], row.categoryLevel3),
    getFirstPresentValue(row['Sub Sub Subcategory'], row.subSubSubcategory, row['Sub Sub Sub Category'], row.subSubSubCategory, row['Subcategory 3'], row.subcategory3, row['Level 4'], row.level4, row['Category Level 4'], row.categoryLevel4),
    getFirstPresentValue(row['Subcategory 4'], row.subcategory4, row['Level 5'], row.level5, row['Category Level 5'], row.categoryLevel5),
    getFirstPresentValue(row['Subcategory 5'], row.subcategory5, row['Level 6'], row.level6, row['Category Level 6'], row.categoryLevel6),
  ]
    .map((segment) => String(segment || '').trim())
    .filter(Boolean);
};

const resolveCategorySlug = ({ name = '', requestedSlug = '', parentId = null, categoriesBySlug, categoriesByNameAndParent }) => {
  const baseSlug = slugify(requestedSlug || name);
  if (!baseSlug) {
    return `category-${Date.now()}`;
  }

  const exactMatch = categoriesByNameAndParent.get(buildNameParentKey(name, parentId));
  if (exactMatch?.slug) {
    return String(exactMatch.slug);
  }

  let candidate = baseSlug;
  let counter = 2;

  while (categoriesBySlug.has(candidate)) {
    const existing = categoriesBySlug.get(candidate);
    if (
      normalizeLookupValue(existing?.name) === normalizeLookupValue(name) &&
      String(existing?.parentId || '') === String(parentId || '')
    ) {
      return candidate;
    }

    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return candidate;
};

const normalizeHeaderRow = (headerRow = []) => {
  const seen = new Map();

  return headerRow.map((value, index) => {
    const baseHeader = String(value || `Column ${index + 1}`).trim() || `Column ${index + 1}`;
    const duplicateCount = seen.get(baseHeader) || 0;
    seen.set(baseHeader, duplicateCount + 1);
    return duplicateCount > 0 ? `${baseHeader} (${duplicateCount + 1})` : baseHeader;
  });
};

const sheetToRows = (sheet) => {
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false,
  });

  const headerIndex = matrix.findIndex((row) => Array.isArray(row) && row.some((cell) => String(cell || '').trim() !== ''));
  if (headerIndex === -1) return [];

  const headers = normalizeHeaderRow(matrix[headerIndex] || []);

  return matrix
    .slice(headerIndex + 1)
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell || '').trim() !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
};

const isRemoteHttpUrl = (value = '') => /^https?:\/\//i.test(String(value || '').trim());

const shouldMirrorImageUrl = (imageUrl = '') => {
  if (!isRemoteHttpUrl(imageUrl)) return false;
  if (!S3_PUBLIC_URL) return true;
  return !isHostedMediaUrl(imageUrl);
};

const getFileExtension = (imageUrl = '', contentType = '') => {
  const byContentType = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
  };

  const normalizedType = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (byContentType[normalizedType]) {
    return byContentType[normalizedType];
  }

  try {
    const pathname = new URL(imageUrl).pathname || '';
    const lastSegment = pathname.split('/').pop() || '';
    const extension = lastSegment.includes('.') ? lastSegment.split('.').pop() : '';
    return extension ? extension.toLowerCase() : 'jpg';
  } catch {
    return 'jpg';
  }
};

const sanitizeFilePart = (value = '') => {
  const sanitized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();

  return sanitized || 'category';
};

const mirrorRemoteCategoryImageToS3 = async (imageUrl, { storeId, slug }) => {
  const normalizedUrl = normalizeRemoteProductImageUrl(imageUrl);
  const fileName = `${sanitizeFilePart(slug)}-${Date.now()}`;
  const upload = await mirrorRemoteImageToS3(normalizedUrl, {
    fileName,
    folder: `categories/imported/${sanitizeFilePart(storeId || 'store')}`,
    minWidth: 0,
  });

  return upload.url;
};

const verifyStoreUser = async (request) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.split(' ')[1];
  const { getAuth } = await import('firebase-admin/auth');
  const { initializeApp, applicationDefault, getApps } = await import('firebase-admin/app');

  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault() });
  }

  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(idToken);
  } catch {
    return null;
  }

  const userId = decodedToken.uid;
  const email = decodedToken.email;

  if (userId && email && await authAdmin(userId, email)) {
    return { userId, email };
  }

  if (!userId) return null;

  const access = await resolveStoreAccess(userId);
  if (!access) return null;

  return {
    userId: access.ownerUserId,
    storeId: access.storeId,
    email,
  };
};

export async function POST(request) {
  try {
    await connectDB();

    const authContext = await verifyStoreUser(request);
    if (!authContext?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'Upload a CSV or spreadsheet file.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return NextResponse.json({ error: 'The uploaded file does not contain any sheets.' }, { status: 400 });
    }

    const rows = sheetToRows(workbook.Sheets[firstSheetName]);
    if (!rows.length) {
      return NextResponse.json({ error: 'The uploaded file does not contain any category rows.' }, { status: 400 });
    }

    const allCategories = await Category.find({}).lean();
    const categoriesBySlug = new Map(allCategories.map((category) => [String(category.slug || ''), category]));
    const categoriesById = new Map(allCategories.map((category) => [String(category._id), category]));
    const categoriesByName = new Map(allCategories.map((category) => [normalizeLookupValue(category.name), category]));
    const categoriesByNameAndParent = new Map(
      allCategories.map((category) => [buildNameParentKey(category.name, category.parentId), category])
    );
    const categoriesByLegacyId = new Map(
      allCategories
        .filter((category) => category.legacySourceId)
        .map((category) => [String(category.legacySourceId), category])
    );

    const preparedRows = [];
    const warnings = [];
    let skippedCount = 0;

    rows.forEach((row, index) => {
      const nameValue = String(getFirstPresentValue(
        row.Name,
        row.name,
        row.Category,
        row.category,
        row.Title,
        row.title
      ) || '').trim();

      const hierarchySegments = getHierarchySegmentsFromRow(row);
      const finalName = hierarchySegments.length
        ? (nameValue && normalizeLookupValue(nameValue) === normalizeLookupValue(hierarchySegments[hierarchySegments.length - 1])
            ? hierarchySegments[hierarchySegments.length - 1]
            : nameValue || hierarchySegments[hierarchySegments.length - 1])
        : nameValue;

      const normalizedHierarchy = hierarchySegments.length
        ? [...hierarchySegments.slice(0, -1), finalName].filter(Boolean)
        : (finalName ? [finalName] : []);

      if (!finalName) {
        skippedCount += 1;
        return;
      }

      const slugInput = String(getFirstPresentValue(row.Slug, row.slug) || '').trim();
      const parentValue = String(getFirstPresentValue(row.Parent, row.parent) || '').trim();

      preparedRows.push({
        rowNumber: index + 2,
        name: finalName,
        slug: slugInput,
        hierarchySegments: normalizedHierarchy,
        description: normalizeText(getFirstPresentValue(row.Description, row.description, row['Short Description'], row.shortDescription)),
        image: String(getFirstPresentValue(row.Image, row.image, row['Image URL'], row.imageUrl, row['Image Url']) || '').trim(),
        url: String(getFirstPresentValue(row.URL, row.Url, row.url) || '').trim(),
        parentId: String(getFirstPresentValue(row['Parent ID'], row.parentId) || '').trim(),
        parentSlug: slugify(getFirstPresentValue(row['Parent Slug'], row.parentSlug, parentValue)),
        parentName: String(getFirstPresentValue(row['Parent Name'], row.parentName, parentValue) || '').trim(),
        includeInMenu: parseBoolean(getFirstPresentValue(row['Include In Menu'], row.includeInMenu, row.Menu, row.menu, row['Add To Menu'], row.addToMenu), false),
        legacySourceId: String(getFirstPresentValue(row['Legacy Source ID'], row.legacySourceId, row['Legacy ID'], row.legacyId) || '').trim() || null,
      });
    });

    if (!preparedRows.length) {
      return NextResponse.json({ error: 'No valid category rows were found in the uploaded file.' }, { status: 400 });
    }

    const results = [];
    const pendingRows = [...preparedRows];
    let createdCount = 0;
    let updatedCount = 0;
    let mirroredImageCount = 0;

    const registerCategory = (category) => {
      categoriesBySlug.set(String(category.slug || ''), category);
      categoriesById.set(String(category._id), category);
      categoriesByName.set(normalizeLookupValue(category.name), category);
      categoriesByNameAndParent.set(buildNameParentKey(category.name, category.parentId), category);
      if (category.legacySourceId) {
        categoriesByLegacyId.set(String(category.legacySourceId), category);
      }
    };

    const ensureHierarchyCategories = async (segments = []) => {
      let resolvedParent = null;

      for (const segment of segments) {
        const segmentName = String(segment || '').trim();
        if (!segmentName) continue;

        const existingByParent = categoriesByNameAndParent.get(buildNameParentKey(segmentName, resolvedParent?._id || null));
        if (existingByParent) {
          resolvedParent = existingByParent;
          continue;
        }

        const hierarchySlug = resolveCategorySlug({
          name: segmentName,
          parentId: resolvedParent?._id || null,
          categoriesBySlug,
          categoriesByNameAndParent,
        });

        const createdCategory = await Category.create({
          name: segmentName,
          slug: hierarchySlug,
          description: null,
          image: null,
          url: buildCategoryUrl(segmentName, hierarchySlug),
          parentId: resolvedParent ? String(resolvedParent._id) : null,
          storeId: authContext.userId,
        });

        const normalizedCategory = createdCategory.toObject();
        registerCategory(normalizedCategory);
        createdCount += 1;
        resolvedParent = normalizedCategory;
      }

      return resolvedParent;
    };

    while (pendingRows.length) {
      const deferredRows = [];
      let progressed = false;

      for (const row of pendingRows) {
        const hierarchyParentSegments = Array.isArray(row.hierarchySegments) && row.hierarchySegments.length > 1
          ? row.hierarchySegments.slice(0, -1)
          : [];
        const hasParentReference = Boolean(hierarchyParentSegments.length || row.parentId || row.parentSlug || row.parentName);
        let resolvedParent = null;

        if (hierarchyParentSegments.length) {
          resolvedParent = await ensureHierarchyCategories(hierarchyParentSegments);
        } else {
          resolvedParent =
            categoriesById.get(row.parentId) ||
            categoriesBySlug.get(row.parentSlug) ||
            categoriesByName.get(normalizeLookupValue(row.parentName));
        }

        if (hasParentReference && !resolvedParent) {
          deferredRows.push(row);
          continue;
        }

        const finalSlug = resolveCategorySlug({
          name: row.name,
          requestedSlug: row.slug,
          parentId: resolvedParent?._id || null,
          categoriesBySlug,
          categoriesByNameAndParent,
        });
        let finalImage = row.image;

        if (shouldMirrorImageUrl(finalImage)) {
          try {
            finalImage = await mirrorRemoteCategoryImageToS3(finalImage, {
              storeId: authContext.userId,
              slug: finalSlug,
            });
            mirroredImageCount += 1;
          } catch (error) {
            warnings.push(`Row ${row.rowNumber}: image could not be mirrored, original URL was kept.`);
          }
        }

        const payload = {
          name: row.name,
          slug: finalSlug,
          description: row.description || null,
          image: finalImage || null,
          url: row.url || buildCategoryUrl(row.name, finalSlug),
          parentId: resolvedParent ? String(resolvedParent._id) : null,
          legacySourceId: row.legacySourceId,
          storeId: authContext.userId,
        };

        const existingCategory =
          (row.legacySourceId ? categoriesByLegacyId.get(row.legacySourceId) : null) ||
          categoriesByNameAndParent.get(buildNameParentKey(row.name, resolvedParent?._id || null)) ||
          categoriesBySlug.get(finalSlug);

        const savedCategory = existingCategory
          ? await Category.findByIdAndUpdate(existingCategory._id, payload, { new: true })
          : await Category.create(payload);

        const normalizedCategory = savedCategory.toObject();
        registerCategory(normalizedCategory);

        results.push({
          category: normalizedCategory,
          includeInMenu: row.includeInMenu,
        });

        if (existingCategory) {
          updatedCount += 1;
        } else {
          createdCount += 1;
        }

        progressed = true;
      }

      if (!deferredRows.length) {
        break;
      }

      if (!progressed) {
        for (const row of deferredRows) {
          warnings.push(`Row ${row.rowNumber}: parent category was not found, so the category was imported at the top level.`);

          const finalSlug = resolveCategorySlug({
            name: row.name,
            requestedSlug: row.slug,
            parentId: null,
            categoriesBySlug,
            categoriesByNameAndParent,
          });
          let finalImage = row.image;

          if (shouldMirrorImageUrl(finalImage)) {
            try {
              finalImage = await mirrorRemoteCategoryImageToS3(finalImage, {
                storeId: authContext.userId,
                slug: finalSlug,
              });
              mirroredImageCount += 1;
            } catch {
              warnings.push(`Row ${row.rowNumber}: image could not be mirrored, original URL was kept.`);
            }
          }

          const payload = {
            name: row.name,
            slug: finalSlug,
            description: row.description || null,
            image: finalImage || null,
            url: row.url || buildCategoryUrl(row.name, finalSlug),
            parentId: null,
            legacySourceId: row.legacySourceId,
            storeId: authContext.userId,
          };

          const existingCategory =
            (row.legacySourceId ? categoriesByLegacyId.get(row.legacySourceId) : null) ||
            categoriesByNameAndParent.get(buildNameParentKey(row.name, null)) ||
            categoriesBySlug.get(finalSlug);

          const savedCategory = existingCategory
            ? await Category.findByIdAndUpdate(existingCategory._id, payload, { new: true })
            : await Category.create(payload);

          const normalizedCategory = savedCategory.toObject();
          registerCategory(normalizedCategory);

          results.push({
            category: normalizedCategory,
            includeInMenu: row.includeInMenu,
          });

          if (existingCategory) {
            updatedCount += 1;
          } else {
            createdCount += 1;
          }
        }

        break;
      }

      pendingRows.splice(0, pendingRows.length, ...deferredRows);
    }

    const menuImportRows = results.filter((entry) => entry.includeInMenu);
    let menuAddedCount = 0;

    if (menuImportRows.length) {
      const existingStoreMenu = await StoreMenu.findOne({ storeId: authContext.userId }).lean();
      const mergedMenuCategories = Array.isArray(existingStoreMenu?.categories)
        ? [...existingStoreMenu.categories]
        : [];

      for (const entry of menuImportRows) {
        const menuCategory = {
          id: String(entry.category._id || entry.category.slug),
          name: entry.category.name,
          image: entry.category.image || '',
          url: entry.category.url || buildCategoryUrl(entry.category.name, entry.category.slug),
          children: [],
        };

        const existingIndex = mergedMenuCategories.findIndex((category) =>
          String(category.id || '') === menuCategory.id ||
          slugify(category.name) === slugify(menuCategory.name) ||
          String(category.url || '') === String(menuCategory.url || '')
        );

        if (existingIndex >= 0) {
          mergedMenuCategories[existingIndex] = {
            ...mergedMenuCategories[existingIndex],
            ...menuCategory,
          };
        } else {
          mergedMenuCategories.push(menuCategory);
          menuAddedCount += 1;
        }
      }

      await StoreMenu.findOneAndUpdate(
        { storeId: authContext.userId },
        {
          storeId: authContext.userId,
          categories: mergedMenuCategories,
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );
    }

    invalidateCategoryCaches();

    return NextResponse.json({
      message: 'Category import completed.',
      counts: {
        processed: preparedRows.length,
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
        mirroredImages: mirroredImageCount,
        addedToMenu: menuAddedCount,
      },
      warnings,
      supportedColumns: [
        'Name',
        'Slug',
        'Category Path',
        'Main Category',
        'Subcategory',
        'Sub Subcategory',
        'Level 1-6',
        'Description',
        'Image',
        'Image URL',
        'URL',
        'Parent',
        'Parent Slug',
        'Parent ID',
        'Include In Menu',
        'Legacy Source ID',
      ],
    }, { status: 200 });
  } catch (error) {
    console.error('Category import failed:', error);
    return NextResponse.json({ error: 'Failed to import categories', details: error.message }, { status: 500 });
  }
}