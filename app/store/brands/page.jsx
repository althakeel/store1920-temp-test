'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiEdit2, FiExternalLink, FiSearch, FiTag } from 'react-icons/fi';
import { useAuth } from '@/lib/useAuth';
import Loading from '@/components/Loading';

export default function StoreBrandsPage() {
  const { getToken, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brands, setBrands] = useState([]);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [search, setSearch] = useState('');
  const [renameFrom, setRenameFrom] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo, setMergeTo] = useState('');

  const loadBrands = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;
      const { data } = await axios.get('/api/store/brands', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBrands(Array.isArray(data?.brands) ? data.brands : []);
      setDuplicateGroups(Array.isArray(data?.duplicateGroups) ? data.duplicateGroups : []);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to load brands');
      setBrands([]);
      setDuplicateGroups([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (user) loadBrands();
  }, [user, loadBrands]);

  const filteredBrands = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return brands;
    return brands.filter((brand) => String(brand.name || '').toLowerCase().includes(query));
  }, [brands, search]);

  const openRename = (brandName) => {
    setRenameFrom(brandName);
    setRenameTo(brandName);
  };

  const saveRename = async () => {
    const from = String(renameFrom || '').trim();
    const to = String(renameTo || '').trim();
    if (!from || !to) {
      toast.error('Enter both current and new brand names');
      return;
    }
    if (from === to) {
      toast.error('New name must be different');
      return;
    }

    try {
      setSaving(true);
      const token = await getToken();
      const { data } = await axios.patch('/api/store/brands', {
        action: 'rename',
        from,
        to,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(data?.message || 'Brand renamed');
      setRenameFrom('');
      setRenameTo('');
      await loadBrands();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to rename brand');
    } finally {
      setSaving(false);
    }
  };

  const saveMerge = async () => {
    const from = String(mergeFrom || '').trim();
    const to = String(mergeTo || '').trim();
    if (!from || !to) {
      toast.error('Choose both brands to merge');
      return;
    }
    if (from === to) {
      toast.error('Pick two different brands');
      return;
    }
    if (!confirm(`Merge “${from}” into “${to}”? All products with “${from}” will use “${to}”.`)) {
      return;
    }

    try {
      setSaving(true);
      const token = await getToken();
      const { data } = await axios.patch('/api/store/brands', {
        action: 'merge',
        from,
        to,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(data?.message || 'Brands merged');
      setMergeFrom('');
      setMergeTo('');
      await loadBrands();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to merge brands');
    } finally {
      setSaving(false);
    }
  };

  const mergeCaseGroup = async (group) => {
    const names = Array.isArray(group?.names) ? group.names : [];
    if (names.length < 2) return;
    const canonical = names.reduce((best, name) => (
      (name?.length || 0) > (best?.length || 0) ? name : best
    ), names[0]);

    if (!confirm(`Merge ${names.length} spellings (${names.join(', ')}) into “${canonical}”?`)) {
      return;
    }

    try {
      setSaving(true);
      const token = await getToken();
      const { data } = await axios.patch('/api/store/brands', {
        action: 'merge-case',
        from: canonical,
        to: canonical,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(data?.message || 'Case variants merged');
      await loadBrands();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to merge case variants');
    } finally {
      setSaving(false);
    }
  };

  if (loading && brands.length === 0) return <Loading />;

  return (
    <div className="w-full max-w-5xl" lang="en" dir="ltr">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl text-slate-500">
            Store <span className="font-medium text-slate-800">Brands</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            View brand names used on products, rename them, and merge duplicates (including different capitalization).
          </p>
        </div>
        <Link
          href="/store/manage-product"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Manage products
          <FiExternalLink size={14} />
        </Link>
      </div>

      {duplicateGroups.length > 0 ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
          <h2 className="text-sm font-semibold text-amber-950">Case duplicates found ({duplicateGroups.length})</h2>
          <p className="mt-1 text-xs text-amber-900">
            Same brand with different capitalization (e.g. Green Lion / GREEN LION). Merge them into one spelling.
          </p>
          <ul className="mt-3 space-y-2">
            {duplicateGroups.slice(0, 8).map((group) => (
              <li
                key={group.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2"
              >
                <div className="min-w-0 text-sm text-slate-700">
                  <span className="font-medium">{group.names.join(' · ')}</span>
                  <span className="ms-2 text-xs text-slate-500">{group.productCount} products</span>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => mergeCaseGroup(group)}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                >
                  Merge spelling
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Rename brand</h2>
          <div className="mt-3 space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500">Current name</span>
              <input
                value={renameFrom}
                onChange={(e) => setRenameFrom(e.target.value)}
                list="store-brands-list"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. green lion"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500">New name</span>
              <input
                value={renameTo}
                onChange={(e) => setRenameTo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. Green Lion"
              />
            </label>
            <button
              type="button"
              onClick={saveRename}
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Rename'}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Merge brand into another</h2>
          <div className="mt-3 space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500">Merge from</span>
              <select
                value={mergeFrom}
                onChange={(e) => setMergeFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select brand…</option>
                {brands.map((brand) => (
                  <option key={`from-${brand.name}`} value={brand.name}>
                    {brand.name} ({brand.productCount})
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500">Merge into</span>
              <select
                value={mergeTo}
                onChange={(e) => setMergeTo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select brand…</option>
                {brands.map((brand) => (
                  <option key={`to-${brand.name}`} value={brand.name}>
                    {brand.name} ({brand.productCount})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={saveMerge}
              disabled={saving}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {saving ? 'Merging…' : 'Merge brands'}
            </button>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brands…"
            className="w-full rounded-lg border border-slate-300 py-2.5 ps-9 pe-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <p className="text-sm text-slate-500">
          {filteredBrands.length} brand{filteredBrands.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Brand</th>
              <th className="px-4 py-3">Products</th>
              <th className="px-4 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredBrands.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                  No brands found. Brands appear here after products have a brand name set.
                </td>
              </tr>
            ) : (
              filteredBrands.map((brand) => (
                <tr key={brand.name} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                      <FiTag className="text-teal-600" size={14} />
                      {brand.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{brand.productCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openRename(brand.name)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <FiEdit2 size={12} />
                        Rename
                      </button>
                      <Link
                        href={`/store/manage-product?brand=${encodeURIComponent(brand.name)}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                      >
                        View products
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <datalist id="store-brands-list">
        {brands.map((brand) => (
          <option key={brand.name} value={brand.name} />
        ))}
      </datalist>
    </div>
  );
}
