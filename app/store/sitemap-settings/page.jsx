'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/useAuth';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiTrash2, FiEdit2, FiPlus } from 'react-icons/fi';
import Loading from '@/components/Loading';

const MAX_CATEGORIES = 12;

export default function SitemapSettingsPage() {
  const { user, getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    text: '',
    url: '',
    image: '',
    useExistingCategory: false,
    existingCategoryId: ''
  });

  const existingCategories = [
    { id: 'fast-delivery', name: 'Fast Delivery' },
    { id: 'trending-featured', name: 'Trending & Featured' },
    { id: 'men-s-fashion', name: "Men's Fashion" },
    { id: 'women-s-fashion', name: "Women's Fashion" },
    { id: 'kids', name: 'Kids' },
    { id: 'electronics', name: 'Electronics' },
    { id: 'mobile-accessories', name: 'Mobile Accessories' },
    { id: 'home-kitchen', name: 'Home & Kitchen' },
    { id: 'beauty', name: 'Beauty' },
    { id: 'car-essentials', name: 'Car Essentials' },
    { id: 'sports-fitness', name: 'Sports & Fitness' },
    { id: 'groceries', name: 'Groceries' },
  ];

  useEffect(() => {
    if (user) {
      fetchCategories();
    }
  }, [user]);

  const fetchCategories = async () => {
    try {
      const token = await getToken();
      const response = await axios.get('/api/store/sitemap-settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCategories(response.data.categories || []);
      setEnabled(response.data.enabled || false);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to load sitemap settings');
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (file) => {
    const formDataToSend = new FormData();
    formDataToSend.append('file', file);

    try {
      const response = await axios.post('/api/upload', formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data.url;
    } catch (error) {
      console.error('Image upload error:', error);
      throw error;
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.text) {
      toast.error('Name and text are required');
      return;
    }

    if (!formData.useExistingCategory && !formData.url) {
      toast.error('URL is required for custom categories');
      return;
    }

    if (!formData.useExistingCategory && !imageFile && !formData.image) {
      toast.error('Image is required for custom categories');
      return;
    }

    if (formData.useExistingCategory && !formData.existingCategoryId) {
      toast.error('Please select an existing category');
      return;
    }

    setLoading(true);
    try {
      let imageUrl = formData.image;

      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }

      const newCategory = formData.useExistingCategory
        ? {
            name: formData.name,
            text: formData.text,
            categoryId: formData.existingCategoryId,
            image: imageUrl || '',
            url: `/category/${formData.existingCategoryId}`,
            isExisting: true
          }
        : {
            name: formData.name,
            text: formData.text,
            url: formData.url,
            image: imageUrl,
            isExisting: false
          };

      let updatedCategories;
      if (editingIndex !== null) {
        updatedCategories = [...categories];
        updatedCategories[editingIndex] = newCategory;
      } else {
        if (categories.length >= MAX_CATEGORIES) {
          toast.error(`Maximum ${MAX_CATEGORIES} categories allowed`);
          setLoading(false);
          return;
        }
        updatedCategories = [...categories, newCategory];
      }

      const token = await getToken();
      await axios.post('/api/store/sitemap-settings', { categories: updatedCategories, enabled }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setCategories(updatedCategories);
      resetForm();
      toast.success(editingIndex !== null ? 'Category updated!' : 'Category added!');
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error(error.response?.data?.error || 'Failed to save category');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (index) => {
    const category = categories[index];
    setFormData({
      name: category.name,
      text: category.text,
      url: category.url || '',
      image: category.image || '',
      useExistingCategory: category.isExisting || false,
      existingCategoryId: category.categoryId || ''
    });
    setImagePreview(category.image || null);
    setEditingIndex(index);
  };

  const handleDelete = async (index) => {
    if (!window.confirm('Delete this category?')) return;

    setLoading(true);
    try {
      const updatedCategories = categories.filter((_, i) => i !== index);
      const token = await getToken();
      await axios.post('/api/store/sitemap-settings', { categories: updatedCategories, enabled }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setCategories(updatedCategories);
      toast.success('Category deleted!');
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      text: '',
      url: '',
      image: '',
      useExistingCategory: false,
      existingCategoryId: ''
    });
    setImageFile(null);
    setImagePreview(null);
    setEditingIndex(null);
  };

  const handleToggleEnabled = async () => {
    setLoading(true);
    try {
      const newEnabledState = !enabled;
      const token = await getToken();
      await axios.post('/api/store/sitemap-settings', { categories, enabled: newEnabledState }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEnabled(newEnabledState);
      toast.success(newEnabledState ? 'Sitemap categories enabled!' : 'Sitemap categories disabled!');
    } catch (error) {
      console.error('Error toggling enabled state:', error);
      toast.error('Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 mb-2">Sitemap Categories</h1>
              <p className="text-slate-600">Manage the categories displayed on your sitemap page</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700">
                {enabled ? 'Enabled' : 'Disabled'}
              </span>
              <button
                onClick={handleToggleEnabled}
                disabled={loading}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  enabled ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    enabled ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Disabled Notice */}
          {!enabled && (
            <div className="lg:col-span-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-amber-800">Sitemap Categories Disabled</h3>
                    <p className="text-sm text-amber-700 mt-1">
                      Custom categories are currently disabled. Enable the toggle above to display them on your sitemap page.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Form Section */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-4">
                {editingIndex !== null ? 'Edit Category' : 'Add Category'}
              </h2>

              <form onSubmit={handleSave} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Category Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Fast Delivery"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Display Text */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Display Text *
                  </label>
                  <input
                    type="text"
                    value={formData.text}
                    onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                    placeholder="e.g., Fast Delivery"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Use Existing Category */}
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.useExistingCategory}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          useExistingCategory: e.target.checked,
                          url: ''
                        })
                      }
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <span className="text-sm font-medium text-slate-700">
                      Use Existing Category
                    </span>
                  </label>
                </div>

                {/* Existing Category Select */}
                {formData.useExistingCategory && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Select Category *
                    </label>
                    <select
                      value={formData.existingCategoryId}
                      onChange={(e) =>
                        setFormData({ ...formData, existingCategoryId: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Choose a category...</option>
                      {existingCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* URL (Custom Category) */}
                {!formData.useExistingCategory && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      URL *
                    </label>
                    <input
                      type="text"
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      placeholder="/category/custom"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                {/* Image */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {formData.useExistingCategory ? 'Custom Image (Optional)' : 'Image *'}
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Image Preview */}
                {imagePreview && (
                  <div className="mt-3">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-2 pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition font-medium"
                  >
                    {loading ? 'Saving...' : editingIndex !== null ? 'Update' : 'Add'}
                  </button>
                  {editingIndex !== null && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition font-medium"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              {/* Progress */}
              <div className="mt-6 pt-6 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">Categories Used</span>
                  <span className="text-sm font-bold text-blue-600">
                    {categories.length} / {MAX_CATEGORIES}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(categories.length / MAX_CATEGORIES) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Categories List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-4">
                Sitemap Categories ({categories.length})
              </h2>

              {categories.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500">No categories added yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {categories.map((category, index) => (
                    <div
                      key={index}
                      className="border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition"
                    >
                      {/* Image */}
                      {category.image && (
                        <img
                          src={category.image}
                          alt={category.name}
                          className="w-full h-32 object-cover"
                        />
                      )}

                      {/* Content */}
                      <div className="p-4">
                        <h3 className="font-bold text-slate-800">{category.name}</h3>
                        <p className="text-sm text-slate-600 mt-1">{category.text}</p>
                        <p className="text-xs text-slate-500 mt-2 truncate">{category.url}</p>
                        {category.isExisting && (
                          <span className="inline-block mt-2 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded font-medium">
                            Existing Category
                          </span>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={() => handleEdit(index)}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition font-medium text-sm"
                          >
                            <FiEdit2 size={16} />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(index)}
                            disabled={loading}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 disabled:bg-slate-100 transition font-medium text-sm"
                          >
                            <FiTrash2 size={16} />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
