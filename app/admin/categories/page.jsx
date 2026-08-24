'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { auth } from '@/lib/firebase';
import { isAdminEmail } from '@/lib/adminEmails';
import toast from 'react-hot-toast';
import { FiTrash2, FiEdit2, FiPlus } from 'react-icons/fi';
import Loading from '@/components/Loading';

export default function CategoriesManager() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    nameAr: '',
    slug: '',
    image: '',
    url: '',
    description: '',
    descriptionAr: '',
    parentId: '',
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');

  // Auth check
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      setIsAdmin(isAdminEmail(user.email));
      setFirebaseUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch categories
  const fetchCategories = async () => {
    try {
      const { data } = await axios.get('/api/admin/categories');
      setCategories(data.categories || []);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to fetch categories');
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchCategories();
    }
  }, [isAdmin]);

  // Handle image selection
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

  // Generate slug from name
  const generateSlug = (name) => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  };

  const handleNameChange = (e) => {
    const name = e.target.value;
    setFormData(prev => ({
      ...prev,
      name,
      slug: generateSlug(name),
    }));
  };

  const selectableParentCategories = categories.filter((category) => category._id !== editingId);
  const categoryNameById = categories.reduce((accumulator, category) => {
    accumulator[category._id] = category.name;
    return accumulator;
  }, {});

  // Save category
  const handleSave = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.slug || !formData.url) {
      toast.error('Name, Slug, and URL are required');
      return;
    }

    try {
      setUploading(true);
      const token = await firebaseUser.getIdToken();
      let imageUrl = formData.image;

      // Upload image if selected
      if (imageFile) {
        const uploadFormData = new FormData();
        uploadFormData.append('file', imageFile);
        const uploadRes = await axios.post('/api/upload', uploadFormData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`,
          },
        });
        imageUrl = uploadRes.data.url;
      }

      const payload = {
        ...formData,
        image: imageUrl,
      };

      if (editingId) {
        // Update existing
        await axios.put(`/api/admin/categories/${editingId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Category updated');
        setEditingId(null);
      } else {
        // Create new
        await axios.post('/api/admin/categories', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Category created');
      }

      setFormData({ name: '', nameAr: '', slug: '', image: '', url: '', description: '', descriptionAr: '' });
      setFormData({ name: '', nameAr: '', slug: '', image: '', url: '', description: '', descriptionAr: '', parentId: '' });
      setImageFile(null);
      setImagePreview('');
      setShowForm(false);
      fetchCategories();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to save category');
    } finally {
      setUploading(false);
    }
  };

  // Edit category
  const handleEdit = (category) => {
    setFormData({
      name: category.name,
      nameAr: category.nameAr || '',
      slug: category.slug,
      image: category.image,
      url: category.url,
      description: category.description || '',
      descriptionAr: category.descriptionAr || '',
      parentId: category.parentId || '',
    });
    setImagePreview(category.image);
    setEditingId(category._id);
    setShowForm(true);
  };

  // Delete category
  const handleDelete = async (id) => {
    if (!confirm('Are you sure?')) return;
    try {
      const token = await firebaseUser.getIdToken();
      await axios.delete(`/api/admin/categories/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Category deleted');
      fetchCategories();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to delete category');
    }
  };

  // Cancel form
  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', nameAr: '', slug: '', image: '', url: '', description: '', descriptionAr: '', parentId: '' });
    setImageFile(null);
    setImagePreview('');
  };

  if (loading) return <Loading />;
  if (!isAdmin) return <div className="p-6 text-red-500">Not authorized</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800">Categories Manager</h1>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <FiPlus /> Add Category
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-2xl font-bold mb-6 text-slate-800">
              {editingId ? 'Edit Category' : 'Create New Category'}
            </h2>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Category Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={handleNameChange}
                    placeholder="e.g., Women's Fashion"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Category Name (Arabic)
                  </label>
                  <input
                    type="text"
                    value={formData.nameAr}
                    onChange={(e) => setFormData(prev => ({ ...prev, nameAr: e.target.value }))}
                    placeholder="مثال: أزياء نسائية"
                    dir="rtl"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Parent Category
                  </label>
                  <select
                    value={formData.parentId}
                    onChange={(e) => setFormData(prev => ({ ...prev, parentId: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">None (top-level category)</option>
                    {selectableParentCategories.map((category) => (
                      <option key={category._id} value={category._id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Select a parent to create this category as a subcategory.
                  </p>
                </div>

                {/* Slug */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    URL Slug * (Auto-generated)
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                    placeholder="auto-generated"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    URL: /category/{formData.slug}
                  </p>
                </div>

                {/* Custom URL */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Custom URL Path *
                  </label>
                  <input
                    type="text"
                    value={formData.url}
                    onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="e.g., /category/womens-fashion"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                    rows="3"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Description (Arabic)
                  </label>
                  <textarea
                    value={formData.descriptionAr}
                    onChange={(e) => setFormData(prev => ({ ...prev, descriptionAr: e.target.value }))}
                    placeholder="وصف القسم باللغة العربية"
                    rows="3"
                    dir="rtl"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Image Upload */}
              <div className="border-t pt-6">
                <label className="block text-sm font-medium text-slate-700 mb-4">
                  Category Image
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      Recommended: 400x300px, JPG/PNG
                    </p>
                  </div>
                  {imagePreview && (
                    <div className="flex justify-center">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-40 h-40 object-cover rounded-lg border border-slate-200"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex gap-4 pt-6 border-t">
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploading ? 'Saving...' : editingId ? 'Update Category' : 'Create Category'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-6 py-2 bg-slate-300 text-slate-700 rounded-lg hover:bg-slate-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Categories List */}
        <div className="grid gap-4">
          {categories.length === 0 ? (
            <div className="bg-white rounded-lg p-8 text-center text-slate-500">
              No categories yet. Create one to get started!
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat._id} className="bg-white rounded-lg shadow p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                  {cat.image && (
                    <img
                      src={cat.image}
                      alt={cat.name}
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-800">{cat.name}</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {cat.parentId ? `Subcategory of ${categoryNameById[cat.parentId] || 'Unknown category'}` : 'Top-level category'}
                    </p>
                    <p className="text-sm text-slate-500">/{cat.slug}</p>
                    <p className="text-xs text-blue-600 mt-1">{cat.url}</p>
                    {cat.description && (
                      <p className="text-sm text-slate-600 mt-1">{cat.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(cat)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                  >
                    <FiEdit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(cat._id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                  >
                    <FiTrash2 size={18} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
