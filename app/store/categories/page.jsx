'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiTrash2, FiPlus, FiEdit2, FiX, FiSearch, FiCheckCircle, FiUpload } from 'react-icons/fi';
import { MdCategory, MdOutlineCheckCircleOutline, MdAutoAwesome } from 'react-icons/md';
import Loading from '@/components/Loading';
import { cleanDisplayText } from '@/lib/displayText';
import { suggestUaeArabicCategory } from '@/lib/categoryLocalization';

const DEFAULT_CATEGORY_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23eff6ff'/%3E%3Cstop offset='100%25' stop-color='%23e2e8f0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='160' height='160' rx='28' fill='url(%23g)'/%3E%3Ccircle cx='80' cy='64' r='24' fill='%23bfdbfe'/%3E%3Cpath d='M38 124c10-22 29-34 42-34s32 12 42 34' fill='%2394a3b8'/%3E%3C/svg%3E";

function getCategoryImageSrc(src = '') {
  return String(src || '').trim() || DEFAULT_CATEGORY_IMAGE;
}

function getCategoryDisplayName(name = '') {
  return cleanDisplayText(name);
}

function slugify(text = '') {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildCategoryUrl(name = '') {
  const slug = slugify(name);
  return slug ? `/${slug}` : '/';
}

const LARGE_DATA_URL_MAX = 4096;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

function getVisiblePageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage]);
  if (currentPage > 1) pages.add(currentPage - 1);
  if (currentPage < totalPages) pages.add(currentPage + 1);

  return Array.from(pages).sort((a, b) => a - b);
}

function isLargeDataUrl(value = '') {
  const trimmed = String(value || '').trim();
  return trimmed.startsWith('data:') && trimmed.length > LARGE_DATA_URL_MAX;
}

async function uploadCategoryImageDataUrl(base64Image, fileName, token) {
  const { data } = await axios.post('/api/store/upload-category-image', {
    base64Image,
    fileName: slugify(fileName) || 'category',
  }, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return data?.url || '';
}

async function prepareCategoryMenuForSave(categories = [], token) {
  return Promise.all(categories.map(async (category) => {
    let image = String(category?.image || '').trim();

    if (isLargeDataUrl(image)) {
      image = await uploadCategoryImageDataUrl(image, category?.name || 'category', token);
    }

    const children = Array.isArray(category?.children)
      ? await prepareCategoryMenuForSave(category.children, token)
      : category?.children;

    return {
      ...category,
      image,
      ...(Array.isArray(children) ? { children } : {}),
    };
  }));
}

async function saveCategoryMenu(categories, token) {
  const preparedCategories = await prepareCategoryMenuForSave(categories, token);
  return axios.post('/api/store/category-menu', { categories: preparedCategories }, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function flattenSystemCategories(categories = []) {
  return categories.map(({ children, ...rest }) => rest);
}

function buildMenuFromSystemCategories(categories = []) {
  const flat = flattenSystemCategories(categories);
  const byId = new Map(flat.map((category) => [String(category._id), category]));

  return flat.map((category) => {
    const parent = category.parentId ? byId.get(String(category.parentId)) : null;
    return {
      id: String(category._id),
      systemCategoryId: String(category._id),
      parentId: category.parentId || null,
      parentName: parent?.name || '',
      name: category.name,
      image: category.image || '',
      url: buildSystemCategoryMenuUrl(category),
      children: [],
    };
  });
}

async function syncStoreMenuFromSystemCategories(categories, token) {
  await saveCategoryMenu(buildMenuFromSystemCategories(categories), token);
}

function buildSystemCategoryMenuUrl(category = {}) {
  if (category?.slug) {
    return `/shop?category=${category.slug}`;
  }
  return category?.url || buildCategoryUrl(category?.name || '');
}

function buildCategoryTree(categories = [], parentId = null) {
  return categories
    .filter((category) => String(category.parentId || '') === String(parentId || ''))
    .map((category) => ({
      ...category,
      children: buildCategoryTree(categories, category._id),
    }));
}

function flattenCategoryOptions(categories = [], depth = 0) {
  return categories.flatMap((category) => [
    {
      id: String(category._id),
      name: category.name,
      nameAr: category.nameAr || '',
      depth,
    },
    ...flattenCategoryOptions(category.children || [], depth + 1),
  ]);
}

function flattenHierarchicalCategories(categories = [], depth = 0) {
  return categories.flatMap((category) => {
    const children = Array.isArray(category.children) ? category.children : [];
    const { children: _children, ...rest } = category;

    return [
      {
        ...rest,
        depth,
        childCount: children.length,
      },
      ...flattenHierarchicalCategories(children, depth + 1),
    ];
  });
}

function getCategoryLevelMeta(depth = 0) {
  if (depth === 0) {
    return {
      label: 'Main Category',
      badgeClassName: 'bg-emerald-600 text-white',
      cardClassName: 'border-emerald-100 bg-gradient-to-r from-emerald-50 to-emerald-100',
      selectClassName: 'bg-emerald-700 text-white',
      useClassName: 'bg-emerald-600 text-white hover:bg-emerald-700',
    };
  }

  if (depth === 1) {
    return {
      label: 'Sub Category',
      badgeClassName: 'bg-blue-600 text-white',
      cardClassName: 'border-blue-100 bg-blue-50',
      selectClassName: 'bg-blue-600 text-white',
      useClassName: 'bg-blue-600 text-white hover:bg-blue-700',
    };
  }

  if (depth === 2) {
    return {
      label: 'Child Category',
      badgeClassName: 'bg-violet-600 text-white',
      cardClassName: 'border-violet-100 bg-violet-50',
      selectClassName: 'bg-violet-600 text-white',
      useClassName: 'bg-violet-600 text-white hover:bg-violet-700',
    };
  }

  if (depth === 3) {
    return {
      label: 'Grandchild Category',
      badgeClassName: 'bg-fuchsia-600 text-white',
      cardClassName: 'border-fuchsia-100 bg-fuchsia-50',
      selectClassName: 'bg-fuchsia-600 text-white',
      useClassName: 'bg-fuchsia-600 text-white hover:bg-fuchsia-700',
    };
  }

  return {
    label: `Nested Level ${depth + 1}`,
    badgeClassName: 'bg-slate-700 text-white',
    cardClassName: 'border-slate-200 bg-slate-50',
    selectClassName: 'bg-slate-700 text-white',
    useClassName: 'bg-slate-700 text-white hover:bg-slate-800',
  };
}

export default function StoreCategoryMenu() {
  const { user, getToken } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [importingCategories, setImportingCategories] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  const categoryImportInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    nameAr: '',
    image: '',
    url: '',
    parentId: '',
    metaTitle: '',
    metaDescription: '',
    description: '',
    descriptionAr: '',
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [generatingImageKey, setGeneratingImageKey] = useState(null);
  const [backfillingArabic, setBackfillingArabic] = useState(false);
  const [translatingDescription, setTranslatingDescription] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [categoryProductCounts, setCategoryProductCounts] = useState({});
  const [totalStoreProducts, setTotalStoreProducts] = useState(0);

  const fetchCategoryProductCounts = async (token) => {
    const { data } = await axios.get('/api/store/categories/product-stats', {
      headers: { Authorization: `Bearer ${token}` },
    });
    setCategoryProductCounts(data?.counts || {});
    setTotalStoreProducts(Number(data?.totalProducts) || 0);
  };

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      const { data } = await axios.get('/api/store/categories', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const nextCategories = data.categories || [];
      setCategories(nextCategories);

      try {
        await fetchCategoryProductCounts(token);
      } catch (error) {
        console.log('Failed to load category product counts', error);
      }

      try {
        const menuRes = await axios.get('/api/store/category-menu', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const menuCount = menuRes.data?.categories?.length || 0;
        const systemCount = flattenSystemCategories(nextCategories).length;
        if (systemCount > 0 && menuCount !== systemCount) {
          await syncStoreMenuFromSystemCategories(nextCategories, token);
        }
      } catch {
        if (nextCategories.length) {
          await syncStoreMenuFromSystemCategories(nextCategories, token);
        }
      }
    } catch (error) {
      console.log('Failed to load categories', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchCategories();
    }
  }, [user]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, pageSize]);

  // Handle image selection
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5MB or smaller');
      e.target.value = '';
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const uploadCategoryImageFile = async (file, token) => {
    const base64Image = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });

    const { data } = await axios.post('/api/store/upload-category-image', {
      base64Image,
      fileName: slugify(formData.name || file.name || 'category'),
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return data?.url || '';
  };

  const handleGenerateCategoryImage = async ({
    name,
    key,
    systemCategory = null,
    applyToForm = false,
  }) => {
    const categoryName = String(name || '').trim();
    if (!categoryName) {
      toast.error('Category name is required');
      return;
    }

    try {
      setGeneratingImageKey(key);
      const token = await getToken();

      if (!token) {
        toast.error('Please login again and retry');
        return;
      }

      const { data } = await axios.post('/api/store/categories/generate-image', {
        categoryName,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const imageUrl = data?.url;
      if (!imageUrl) {
        toast.error('AI did not return an image URL');
        return;
      }

      if (applyToForm) {
        setFormData((prev) => ({ ...prev, image: imageUrl }));
        setImagePreview(imageUrl);
        setImageFile(null);
      }

      if (systemCategory?._id) {
        await axios.put(`/api/store/categories/${systemCategory._id}`, {
          name: systemCategory.name,
          description: systemCategory.description || null,
          image: imageUrl,
          parentId: systemCategory.parentId || null,
        }, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      toast.success(`Image generated with ${data?.provider || 'AI'}`);
      await fetchCategories();
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.message || 'Failed to generate category image');
    } finally {
      setGeneratingImageKey(null);
    }
  };

  const handleImportCategories = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImportingCategories(true);
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await axios.post('/api/store/categories/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`,
        },
      });

      await fetchCategories();

      const summary = data?.counts
        ? `Created ${data.counts.created}, updated ${data.counts.updated}, mirrored ${data.counts.mirroredImages} image${data.counts.mirroredImages === 1 ? '' : 's'}`
        : 'Categories imported';

      toast.success(summary);

      if (Array.isArray(data?.warnings) && data.warnings.length) {
        toast((t) => (
          <div className="max-w-sm text-sm">
            <p className="font-semibold text-slate-900 mb-1">Import completed with notes</p>
            <p className="text-slate-600 line-clamp-4">{data.warnings.join(' ')}</p>
            <button
              type="button"
              onClick={() => toast.dismiss(t.id)}
              className="mt-2 text-blue-600 font-medium"
            >
              Close
            </button>
          </div>
        ), { duration: 7000 });
      }
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to import categories');
    } finally {
      setImportingCategories(false);
      event.target.value = '';
    }
  };

  // Save category
  const handleSave = async (e) => {
    e.preventDefault();
    
    if (!formData.name?.trim()) {
      toast.error('Category name is required');
      return;
    }

    try {
      setUploading(true);
      const token = await getToken();

      if (!token) {
        toast.error('Please login again and retry');
        return;
      }

      let imageUrl = formData.image || '';
      const selectedParentId = String(formData.parentId || '').trim();
      const flatCategories = flattenSystemCategories(categories);
      const categoryById = new Map(flatCategories.map((category) => [String(category._id), category]));
      const selectedParent = selectedParentId ? categoryById.get(selectedParentId) : null;

      if (imageFile) {
        imageUrl = await uploadCategoryImageFile(imageFile, token);
        if (!imageUrl) {
          toast.error('Image upload failed. Please try again.');
          return;
        }
      }

      const existingSystemCategoryId = String(editingCategoryId || '').trim();
      const matchingSystemCategory = flatCategories.find((category) => (
        category.slug === slugify(formData.name)
        || String(category._id) === existingSystemCategoryId
      ));

      let syncedCategory = null;
      const categoryPayload = {
        name: formData.name.trim(),
        nameAr: formData.nameAr?.trim() || suggestUaeArabicCategory({
          name: formData.name.trim(),
          slug: slugify(formData.name.trim()),
        }) || '',
        image: imageUrl || null,
        parentId: selectedParentId || null,
        metaTitle: formData.metaTitle?.trim() || '',
        metaDescription: formData.metaDescription?.trim() || '',
        description: formData.description?.trim() || '',
        descriptionAr: formData.descriptionAr?.trim() || '',
      };

      try {
        if (existingSystemCategoryId) {
          const updateResponse = await axios.put(`/api/store/categories/${existingSystemCategoryId}`, categoryPayload, {
            headers: { Authorization: `Bearer ${token}` },
          });
          syncedCategory = updateResponse.data?.category || null;
        } else if (matchingSystemCategory?._id && !existingSystemCategoryId) {
          const updateResponse = await axios.put(`/api/store/categories/${matchingSystemCategory._id}`, categoryPayload, {
            headers: { Authorization: `Bearer ${token}` },
          });
          syncedCategory = updateResponse.data?.category || matchingSystemCategory;
        } else {
          const createResponse = await axios.post('/api/store/categories', categoryPayload, {
            headers: { Authorization: `Bearer ${token}` },
          });
          syncedCategory = createResponse.data?.category || null;
        }
      } catch (syncError) {
        toast.error(syncError?.response?.data?.error || 'Failed to save category');
        return;
      }

      toast.success(editingCategoryId ? 'Category updated!' : 'Category added!');
      await fetchCategories();
      handleCancel();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to save category');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleTranslateDescription = async () => {
    const english = formData.description?.trim();
    if (!english) {
      toast.error('Enter the English description first');
      return;
    }

    try {
      setTranslatingDescription(true);
      const token = await getToken();
      if (!token) {
        toast.error('Please wait a moment and try again');
        return;
      }

      const { data } = await axios.post('/api/store/categories/translate-arabic', {
        text: english,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const translated = String(data?.descriptionAr || '').trim();
      if (!translated) {
        toast.error('Could not translate description');
        return;
      }

      setFormData((prev) => ({ ...prev, descriptionAr: translated }));
      toast.success('Arabic description filled');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to translate description');
    } finally {
      setTranslatingDescription(false);
    }
  };

  const handleBackfillArabic = async () => {
    try {
      setBackfillingArabic(true);
      const token = await getToken();
      const { data } = await axios.post('/api/store/categories/backfill-arabic', {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchCategories();
      toast.success(`Updated ${data?.updated || 0} categories with UAE Arabic names`);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to apply Arabic names');
    } finally {
      setBackfillingArabic(false);
    }
  };

  const handleDelete = async (categoryId) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      const token = await getToken();
      await axios.delete(`/api/store/categories/${categoryId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchCategories();
      toast.success('Category deleted');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to delete category');
    }
  };

  const handleEdit = (category) => {
    setFormData({
      name: category.name,
      nameAr: category.nameAr || suggestUaeArabicCategory(category) || '',
      image: category.image || '',
      url: buildSystemCategoryMenuUrl(category),
      parentId: category.parentId || '',
      metaTitle: category.metaTitle || '',
      metaDescription: category.metaDescription || '',
      description: category.description || '',
      descriptionAr: category.descriptionAr || '',
    });
    setImagePreview(category.image || '');
    setEditingCategoryId(String(category._id));
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingCategoryId(null);
    setFormData({ name: '', nameAr: '', image: '', url: '', parentId: '', metaTitle: '', metaDescription: '', description: '', descriptionAr: '' });
    setImageFile(null);
    setImagePreview('');
  };

  const toggleCategorySelection = (categoryId) => {
    setSelectedCategoryIds((current) => (
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    ));
  };

  const handleDeleteSelectedCategories = async () => {
    if (!selectedCategoryIds.length) {
      toast.error('Select categories to delete');
      return;
    }

    if (!confirm(`Delete ${selectedCategoryIds.length} selected categor${selectedCategoryIds.length === 1 ? 'y' : 'ies'}? Nested categories under a selected parent will be deleted too.`)) {
      return;
    }

    try {
      setDeletingSelected(true);
      const token = await getToken();
      const { data } = await axios.post('/api/store/categories/bulk-delete', {
        ids: selectedCategoryIds,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const deletedIds = data?.deleted || [];
      const failed = Array.isArray(data?.failed) ? data.failed : [];

      await fetchCategories();
      setSelectedCategoryIds((current) => current.filter((id) => !deletedIds.includes(id)));

      if (deletedIds.length) {
        toast.success(`Deleted ${deletedIds.length} categor${deletedIds.length === 1 ? 'y' : 'ies'}`);
      } else if (!failed.length) {
        toast.error('No categories were deleted');
      }

      if (failed.length) {
        toast.error(`${failed[0].name}: ${failed[0].error}`);
      }
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to delete selected categories');
    } finally {
      setDeletingSelected(false);
    }
  };

  const handleSelectAllVisibleCategories = () => {
    setSelectedCategoryIds((current) => {
      const allSelected = visibleCategoryIds.length > 0 && visibleCategoryIds.every((id) => current.includes(id));
      if (allSelected) {
        return current.filter((id) => !visibleCategoryIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleCategoryIds]));
    });
  };

  const flatCategories = useMemo(() => flattenSystemCategories(categories), [categories]);
  const filteredCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return flatCategories;

    const byId = new Map(flatCategories.map((category) => [String(category._id), category]));
    const matchedIds = new Set();

    flatCategories.forEach((category) => {
      const matches = category.name.toLowerCase().includes(query)
        || String(category.nameAr || '').toLowerCase().includes(query)
        || category.slug?.toLowerCase().includes(query);

      if (!matches) return;

      matchedIds.add(String(category._id));

      let parentId = category.parentId;
      while (parentId) {
        const parentKey = String(parentId);
        matchedIds.add(parentKey);
        parentId = byId.get(parentKey)?.parentId;
      }
    });

    return flatCategories.filter((category) => matchedIds.has(String(category._id)));
  }, [flatCategories, searchQuery]);

  const hierarchicalCategories = useMemo(
    () => buildCategoryTree(filteredCategories),
    [filteredCategories],
  );
  const displayCategories = useMemo(
    () => flattenHierarchicalCategories(hierarchicalCategories),
    [hierarchicalCategories],
  );
  const categoryOptions = flattenCategoryOptions(buildCategoryTree(flatCategories));
  const selectableParentOptions = categoryOptions.filter((category) => category.id !== String(editingCategoryId || ''));
  const totalPages = Math.max(1, Math.ceil(displayCategories.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedCategories = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return displayCategories.slice(startIndex, startIndex + pageSize);
  }, [displayCategories, pageSize, safeCurrentPage]);
  const visibleCategoryIds = paginatedCategories.map((category) => String(category._id));
  const selectedCategorySet = new Set(selectedCategoryIds);
  const allVisibleSelected = visibleCategoryIds.length > 0 && visibleCategoryIds.every((id) => selectedCategorySet.has(id));
  const categoriesWithImages = flatCategories.filter((category) => category.image).length;

  const paginationStart = displayCategories.length ? ((safeCurrentPage - 1) * pageSize) + 1 : 0;
  const paginationEnd = displayCategories.length
    ? Math.min(safeCurrentPage * pageSize, displayCategories.length)
    : 0;

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  const renderPaginationControls = ({
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalItems,
    paginationStart,
    paginationEnd,
    itemLabel = 'items',
    className = '',
  }) => {
    if (!totalItems) return null;

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const visiblePages = getVisiblePageNumbers(currentPage, totalPages);

    return (
      <div className={`flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-md sm:flex-row sm:items-center sm:justify-between sm:px-4 ${className}`}>
        <p className="text-xs text-slate-600 sm:text-sm">
          Showing {paginationStart}-{paginationEnd} of {totalItems} {itemLabel}
          {totalPages > 1 ? ` · Page ${currentPage} of ${totalPages}` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <label className="text-[11px] font-medium text-slate-500 sm:text-xs">Per page</label>
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) || PAGE_SIZE_OPTIONS[0]);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 sm:py-1.5 sm:text-sm"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage <= 1}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm"
          >
            Previous
          </button>
          <div className="flex flex-wrap items-center gap-1">
            {visiblePages.map((page, index) => {
              const previousPage = visiblePages[index - 1];
              const shouldInsertGap = previousPage && page - previousPage > 1;

              return (
                <div key={page} className="flex items-center gap-1">
                  {shouldInsertGap ? <span className="px-1 text-slate-400">...</span> : null}
                  <button
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`h-8 min-w-8 rounded-lg px-2 text-xs font-medium transition sm:h-9 sm:min-w-9 sm:px-3 sm:text-sm ${
                      page === currentPage
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {page}
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage >= totalPages}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  const paginationProps = {
    currentPage: safeCurrentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalItems: displayCategories.length,
    paginationStart,
    paginationEnd,
    itemLabel: 'categories',
  };

  const renderSystemCategoryNode = (category, depth = 0, { showNestedChildren = true } = {}) => {
    const meta = getCategoryLevelMeta(depth);
    const categoryId = String(category._id);
    const isSelected = selectedCategorySet.has(categoryId);
    const childCount = Number.isFinite(category.childCount)
      ? category.childCount
      : (Array.isArray(category.children) ? category.children.length : 0);
    const hasChildren = childCount > 0;
    const productCount = categoryProductCounts[categoryId] || 0;

    return (
      <div key={String(category._id)} className={`rounded-xl border shadow-md ${meta.cardClassName} ${isSelected ? 'border-blue-500 ring-2 ring-blue-100' : ''}`}>
        <div className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex items-start gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => toggleCategorySelection(String(category._id))}
              className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition sm:h-6 sm:w-6 ${
                isSelected
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 bg-white text-transparent hover:border-blue-400'
              }`}
              aria-label={`Select ${getCategoryDisplayName(category.name)}`}
            >
              <FiCheckCircle size={12} />
            </button>

            <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-white/70 bg-white shadow-sm sm:h-14 sm:w-14">
              <img
                src={getCategoryImageSrc(category.image)}
                alt={getCategoryDisplayName(category.name)}
                className="h-full w-full object-cover"
                onError={(event) => {
                  event.currentTarget.src = DEFAULT_CATEGORY_IMAGE;
                }}
              />
              <div className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.badgeClassName}`}>
                {meta.label}
              </div>
            </div>
            </div>

            <div className="min-w-0 flex-1 w-full">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className={`font-semibold text-slate-900 ${depth === 0 ? 'text-base sm:text-lg' : depth === 1 ? 'text-sm sm:text-base' : 'text-sm'}`}>{getCategoryDisplayName(category.name)}</h3>
                  {(category.nameAr || suggestUaeArabicCategory(category)) ? (
                    <p className="mt-1 text-sm text-slate-600" dir="rtl">
                      {category.nameAr || suggestUaeArabicCategory(category)}
                    </p>
                  ) : null}
                  {category.slug && (
                    <p className="mt-1 inline-block rounded-md bg-white px-2 py-0.5 text-[11px] font-mono text-slate-700 sm:text-xs">
                      Slug: {category.slug}
                    </p>
                  )}
                  {category.description && (
                    <p className="mt-1 text-xs text-slate-600 sm:text-sm">{category.description}</p>
                  )}
                  {(category.metaTitle || category.metaDescription) && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      SEO: {category.metaTitle || 'custom description set'}
                    </p>
                  )}
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-xs">
                    {hasChildren
                      ? `${meta.label} with ${childCount} nested ${childCount === 1 ? 'category' : 'categories'}`
                      : `${meta.label} with no nested categories`}
                  </p>
                  <p className="mt-1 inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700 sm:text-xs">
                    {productCount} {productCount === 1 ? 'product' : 'products'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5 xl:flex-col xl:items-end">
                  <button
                    type="button"
                    onClick={() => toggleCategorySelection(String(category._id))}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:py-2 sm:text-sm ${
                      isSelected
                        ? meta.selectClassName
                        : 'border border-white/80 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {isSelected ? 'Selected' : 'Select'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(category)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:py-2 sm:text-sm ${meta.useClassName}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <FiEdit2 size={14} />
                      Edit
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(String(category._id))}
                    className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 sm:px-3 sm:py-2 sm:text-sm"
                  >
                    <span className="flex items-center gap-1.5">
                      <FiTrash2 size={14} />
                      Delete
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateCategoryImage({
                      name: category.name,
                      key: `system-${category._id}`,
                      systemCategory: category,
                    })}
                    disabled={!category.name?.trim() || generatingImageKey === `system-${category._id}`}
                    className="rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      <MdAutoAwesome />
                      {generatingImageKey === `system-${category._id}` ? 'Generating...' : 'Generate image'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {showNestedChildren && hasChildren ? (
          <div className="border-t border-white/70 bg-white/70 p-3">
            <div className="space-y-3 pl-1 md:pl-4">
              {category.children.map((child) => renderSystemCategoryNode(child, depth + 1, { showNestedChildren: true }))}
            </div>
          </div>
        ) : showNestedChildren ? (
          <div className="border-t border-white/70 bg-white/70 px-3 py-3 text-center text-xs italic text-slate-500 sm:text-sm">
            No nested categories
          </div>
        ) : null}
      </div>
    );
  };

  if (loading) return <Loading />;
  if (!user) return <div className="p-6 text-red-500">Please login</div>;

  return (
    <div className="min-h-0 w-full bg-white px-3 py-3 sm:px-4 sm:py-4 md:px-5 lg:px-6">
      <div className="mx-auto w-full max-w-7xl">
        {/* Header Section */}
        <div className="mb-4 sm:mb-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="self-start rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 p-2.5 shadow-md sm:p-3">
              <MdCategory className="text-xl text-white sm:text-2xl" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl lg:text-[1.65rem]">Store Categories</h1>
              <p className="mt-1 text-xs text-slate-600 sm:text-sm">Add, edit, import, and organize all store categories in one place</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-white p-3.5 shadow-md transition-shadow hover:shadow-lg sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs">Total Categories</p>
                  <p className="mt-1 text-2xl font-bold text-blue-600 sm:text-3xl">{flatCategories.length}</p>
                  <p className="mt-0.5 text-xs text-slate-500">in your store</p>
                </div>
                <div className="rounded-lg bg-blue-100 p-2.5 sm:p-3">
                  <MdCategory className="text-xl text-blue-600 sm:text-2xl" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-3.5 shadow-md transition-shadow hover:shadow-lg sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs">Store Products</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-600 sm:text-3xl">{totalStoreProducts}</p>
                  <p className="mt-0.5 text-xs text-slate-500">assigned across categories</p>
                </div>
                <div className="rounded-lg bg-emerald-100 p-2.5 sm:p-3">
                  <FiCheckCircle className="text-xl text-emerald-600 sm:text-2xl" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-3.5 shadow-md transition-shadow hover:shadow-lg sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs">With Images</p>
                  <p className="mt-1 text-2xl font-bold text-purple-600 sm:text-3xl">{categoriesWithImages}</p>
                  <p className="mt-0.5 text-xs text-slate-500">ready for storefront display</p>
                </div>
                <div className="rounded-lg bg-purple-100 p-2.5 sm:p-3">
                  <FiCheckCircle className="text-xl text-purple-600 sm:text-2xl" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-md sm:p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Manage categories</p>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">All categories appear on your store automatically. No separate menu step needed.</p>
          </div>
          <div className="flex w-full flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 sm:px-3 sm:py-1.5 sm:text-sm">
              {selectedCategoryIds.length} selected
            </span>
            <button
              type="button"
              onClick={handleSelectAllVisibleCategories}
              disabled={!visibleCategoryIds.length}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3.5 sm:py-2 sm:text-sm"
            >
              {allVisibleSelected ? 'Unselect Page' : 'Select Page'}
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategoryIds([])}
              disabled={!selectedCategoryIds.length}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3.5 sm:py-2 sm:text-sm"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleDeleteSelectedCategories}
              disabled={!selectedCategoryIds.length || deletingSelected}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3.5 sm:py-2 sm:text-sm"
            >
              {deletingSelected ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:mb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {!showForm && (
              <button
                type="button"
                onClick={handleBackfillArabic}
                disabled={backfillingArabic}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:py-2.5 sm:text-sm"
              >
                {backfillingArabic ? 'Applying Arabic...' : 'Apply UAE Arabic Names'}
              </button>
            )}
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:shadow-lg sm:w-auto sm:px-5 sm:py-2.5 sm:text-sm"
              >
                <FiPlus size={16} />
                Add Category
              </button>
            )}

            <button
              type="button"
              onClick={() => categoryImportInputRef.current?.click()}
              disabled={importingCategories}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-5 sm:py-2.5 sm:text-sm"
            >
              <FiUpload size={16} />
              {importingCategories ? 'Importing...' : 'Import Categories'}
            </button>

            <input
              ref={categoryImportInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleImportCategories}
              className="hidden"
            />
          </div>

          <div className="max-w-full rounded-lg border border-blue-100 bg-white/80 px-3 py-2.5 text-xs text-slate-600 shadow-sm sm:px-4 sm:text-sm lg:max-w-xl">
            <p className="font-semibold text-slate-900">Spreadsheet import</p>
            <p className="mt-0.5 leading-snug">Supported columns: Name, Slug, Description, Image or Image URL, URL, Parent, Parent Slug, Parent ID, Category Path, Main Category, Subcategory, Sub Subcategory, Level 1-6, Legacy Source ID.</p>
          </div>
        </div>

        <div className="mb-4 sm:mb-5">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-slate-400 sm:left-3.5" />
            <input
              type="text"
              placeholder="Search categories by name or slug..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:py-2.5 sm:pl-10 sm:pr-4"
            />
          </div>
        </div>

        {showForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
                <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl sm:max-w-2xl">
                  <div className="sticky top-0 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700 p-4 sm:p-5">
                    <h2 className="text-lg font-bold text-white sm:text-xl">
                      {editingCategoryId ? '✏️ Edit Category' : '➕ Add Category'}
                    </h2>
                    <button
                      onClick={handleCancel}
                      className="rounded-lg p-1.5 text-white transition hover:bg-blue-500"
                    >
                      <FiX size={20} />
                    </button>
                  </div>

                  <form onSubmit={handleSave} className="space-y-5 p-4 sm:space-y-6 sm:p-6">
                    {/* Name Field */}
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-700 sm:text-sm">
                        Category Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g., Women's Fashion, Electronics, Home & Garden"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:px-4 sm:py-2.5"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-700 sm:text-sm">
                        Arabic Name (UAE)
                      </label>
                      <input
                        type="text"
                        value={formData.nameAr}
                        onChange={(e) => setFormData(prev => ({ ...prev, nameAr: e.target.value }))}
                        placeholder="مثال: إلكترونيات"
                        dir="rtl"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:px-4 sm:py-2.5 text-right"
                      />
                      <p className="mt-1.5 text-xs text-slate-500">
                        Shown on the Arabic storefront. Leave blank to auto-suggest UAE Arabic from the English name.
                      </p>
                    </div>

                    {/* URL Field */}
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-700 sm:text-sm">
                        Category URL (auto-generated)
                      </label>
                      <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 sm:px-4 sm:py-2.5">
                        {buildCategoryUrl(formData.name)}
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-700 sm:text-sm">
                        Parent Category
                      </label>
                      <select
                        value={formData.parentId}
                        onChange={(e) => setFormData((prev) => ({ ...prev, parentId: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:px-4 sm:py-2.5"
                      >
                        <option value="">None (top-level category)</option>
                        {selectableParentOptions.map((category) => (
                          <option key={category.id} value={category.id}>
                            {`${'-- '.repeat(category.depth)}${getCategoryDisplayName(category.name)}${category.nameAr ? ` · ${category.nameAr}` : ''}`}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-slate-500">
                        Choose a parent to make this a subcategory or grandchild category.
                      </p>
                    </div>

                    <div className="border-t border-slate-100 pt-4 sm:pt-5">
                      <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-slate-700 sm:text-sm">
                        Description
                      </label>
                      <div className="space-y-4">
                        <div>
                          <label className="mb-2 block text-xs font-semibold text-slate-600 sm:text-sm">
                            Category Description
                          </label>
                          <textarea
                            value={formData.description}
                            maxLength={2000}
                            rows={4}
                            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder="Shown on the category page under the name and reviews"
                            className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:px-4 sm:py-2.5"
                          />
                          <p className="mt-1.5 text-xs text-slate-500">
                            {(formData.description || '').length}/2000 · This is the public page text, not the SEO meta description.
                          </p>
                        </div>
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <label className="block text-xs font-semibold text-slate-600 sm:text-sm">
                              Arabic Description
                            </label>
                            <button
                              type="button"
                              onClick={handleTranslateDescription}
                              disabled={translatingDescription || !formData.description?.trim()}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <MdAutoAwesome className="text-sm" />
                              {translatingDescription ? 'Translating...' : 'Translate'}
                            </button>
                          </div>
                          <textarea
                            value={formData.descriptionAr}
                            maxLength={2000}
                            rows={3}
                            dir="rtl"
                            onChange={(e) => setFormData((prev) => ({ ...prev, descriptionAr: e.target.value }))}
                            placeholder="وصف الفئة في الواجهة العربية"
                            className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-right text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:px-4 sm:py-2.5"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4 sm:pt-5">
                      <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-slate-700 sm:text-sm">
                        SEO
                      </label>
                      <div className="space-y-4">
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <label className="block text-xs font-semibold text-slate-600 sm:text-sm">
                              Meta Title
                            </label>
                            <span className="text-[11px] text-slate-400">
                              {(formData.metaTitle || '').length}/120
                            </span>
                          </div>
                          <input
                            type="text"
                            value={formData.metaTitle}
                            maxLength={120}
                            onChange={(e) => setFormData((prev) => ({ ...prev, metaTitle: e.target.value }))}
                            placeholder="e.g., Women's Fashion | Store1920"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:px-4 sm:py-2.5"
                          />
                        </div>
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <label className="block text-xs font-semibold text-slate-600 sm:text-sm">
                              Meta Description
                            </label>
                            <span className="text-[11px] text-slate-400">
                              {(formData.metaDescription || '').length}/320
                            </span>
                          </div>
                          <textarea
                            value={formData.metaDescription}
                            maxLength={320}
                            rows={3}
                            onChange={(e) => setFormData((prev) => ({ ...prev, metaDescription: e.target.value }))}
                            placeholder="Short description for search engines and social previews"
                            className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:px-4 sm:py-2.5"
                          />
                          <p className="mt-1.5 text-xs text-slate-500">
                            Used on the category page. Leave blank to use the default title and description.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Image Upload */}
                    <div className="border-t border-slate-100 pt-4 sm:pt-5">
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 sm:text-sm">
                          Category Image <span className="font-normal normal-case text-slate-500">(optional)</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleGenerateCategoryImage({
                            name: formData.name,
                            key: 'form-image',
                            applyToForm: true,
                          })}
                          disabled={!formData.name.trim() || generatingImageKey === 'form-image'}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3.5 sm:py-2 sm:text-sm"
                        >
                          <MdAutoAwesome className="text-sm" />
                          {generatingImageKey === 'form-image' ? 'Creating...' : 'Create with AI'}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="col-span-1">
                          <div className="relative cursor-pointer rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 transition hover:border-blue-500 sm:p-5">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageChange}
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                            <div className="flex flex-col items-center justify-center text-center">
                              <FiPlus className="mb-2 text-2xl text-slate-400" />
                              <p className="text-xs font-semibold text-slate-700 sm:text-sm">Click to upload</p>
                              <p className="mt-0.5 text-xs text-slate-500">or drag and drop</p>
                              <p className="mt-1.5 text-[11px] text-slate-400">PNG, JPG up to 5MB · 150x150px</p>
                            </div>
                          </div>
                        </div>

                        {/* Image Preview */}
                        {imagePreview && (
                          <div className="col-span-1 flex items-center justify-center">
                            <div className="relative">
                              <img
                                src={getCategoryImageSrc(imagePreview)}
                                alt="Preview"
                                className="h-28 w-28 rounded-lg border border-blue-200 object-cover shadow-md sm:h-32 sm:w-32"
                                onError={(event) => {
                                  event.currentTarget.src = DEFAULT_CATEGORY_IMAGE;
                                }}
                              />
                              <div className="absolute -right-1.5 -top-1.5 rounded-full bg-emerald-500 p-0.5">
                                <MdOutlineCheckCircleOutline className="text-base text-white sm:text-lg" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Form Actions */}
                    <div className="flex gap-2 border-t border-slate-100 pt-4 sm:gap-3 sm:pt-5">
                      <button
                        type="submit"
                        disabled={uploading}
                        className="flex-1 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 py-2.5 text-sm font-semibold text-white transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {uploading ? '⏳ Saving...' : editingCategoryId ? '💾 Update Category' : '✨ Add Category'}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancel}
                        className="flex-1 rounded-lg bg-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

        {flatCategories.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm sm:p-8">
            <div className="mb-3 flex justify-center">
              <div className="rounded-full bg-slate-100 p-3">
                <MdCategory className="text-2xl text-slate-400 sm:text-3xl" />
              </div>
            </div>
            <p className="mb-1 text-lg font-bold text-slate-700 sm:text-xl">No Categories Yet</p>
            <p className="mb-4 text-sm text-slate-600">Create or import your first category to get started</p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <FiPlus size={16} /> Create First Category
            </button>
          </div>
        ) : displayCategories.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm sm:p-8">
            <p className="text-base font-bold text-slate-700 sm:text-lg">No Categories Found</p>
            <p className="mt-1 text-sm text-slate-600">Try adjusting your search terms</p>
          </div>
        ) : (
          <>
            {renderPaginationControls({ ...paginationProps, className: 'mb-4' })}
            <div className="space-y-4 sm:space-y-5">
              {paginatedCategories.map((category) => renderSystemCategoryNode(category, category.depth, { showNestedChildren: false }))}
            </div>
            {renderPaginationControls({ ...paginationProps, className: 'mt-4 sm:mt-5' })}
          </>
        )}
      </div>
    </div>
  );
}
