'use client'

export const dynamic = 'force-dynamic'
import { useEffect, useState, useRef } from 'react'

import axios from 'axios'
import toast from 'react-hot-toast'
import { SaveIcon, TruckIcon, PackageIcon, SearchIcon, XIcon, PlusIcon, Trash2Icon, ChevronDown } from 'lucide-react'
import { useAuth } from '@/lib/useAuth'
import { UAE_EMIRATES } from '@/lib/uaeEmirateAreas'
import {
  createEmptyShippingOption,
  resolveShippingOptions,
  SHIPPING_LOGIC_LABELS,
  findExpressShippingOption,
  getExpressExtraFee,
  upsertExpressShippingOption,
} from '@/lib/shippingOptions'

const SHIPPING_SECTIONS_STORAGE_KEY = 'store1920-shipping-sections'
const SHIPPING_OPTIONS_STORAGE_KEY = 'store1920-shipping-delivery-options'

function parseSettingNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseOptionalFeeInput(value) {
  if (value === '' || value === null || value === undefined) return ''
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : ''
}

function mapSettingToForm(setting) {
  const shippingOptions = resolveShippingOptions(setting).map((option) => ({
    ...option,
    maxItemFee: option.maxItemFee == null ? '' : option.maxItemFee,
  }))

  return {
    enabled: Boolean(setting.enabled),
    shippingOptions: shippingOptions.length
      ? shippingOptions
      : [createEmptyShippingOption({ isDefault: true })],
    freeShippingMin: parseSettingNumber(setting.freeShippingMin, 100),
    enableProductSpecificFreeShipping: Boolean(setting.enableProductSpecificFreeShipping),
    localDeliveryFee: setting.localDeliveryFee != null && setting.localDeliveryFee !== ''
      ? parseSettingNumber(setting.localDeliveryFee, '')
      : '',
    regionalDeliveryFee: setting.regionalDeliveryFee != null && setting.regionalDeliveryFee !== ''
      ? parseSettingNumber(setting.regionalDeliveryFee, '')
      : '',
    stateCharges: Array.isArray(setting.stateCharges)
      ? setting.stateCharges.map((entry) => ({
          state: String(entry?.state || '').trim(),
          fee: parseSettingNumber(entry?.fee, 0),
        })).filter((entry) => entry.state)
      : [],
    enableCOD: setting.enableCOD !== false,
    enableCard: setting.enableCard !== false,
    enableTabby: setting.enableTabby !== false,
    enableTamara: setting.enableTamara !== false,
    codFee: parseSettingNumber(setting.codFee, 0),
    maxCODAmount: parseSettingNumber(setting.maxCODAmount, 0),
    maxCardAmount: parseSettingNumber(setting.maxCardAmount, 0),
    maxTabbyAmount: parseSettingNumber(setting.maxTabbyAmount, 0),
    maxTamaraAmount: parseSettingNumber(setting.maxTamaraAmount, 0),
  }
}

function readStoredOpenState(storageKey) {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function persistOpenState(storageKey, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // ignore
  }
}

function ShippingSection({ title, icon: Icon, iconLabel, description, isOpen, onToggle, children }) {
  return (
    <div className='overflow-hidden rounded-xl border border-slate-200 bg-white'>
      <button
        type='button'
        onClick={onToggle}
        className='flex w-full items-start justify-between gap-3 p-5 text-left transition hover:bg-slate-50'
      >
        <div className='min-w-0'>
          <h2 className='flex items-center gap-2 text-xl font-semibold text-slate-800'>
            {iconLabel ? (
              <span className='inline-flex h-5 shrink-0 items-center rounded bg-slate-100 px-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-700'>
                {iconLabel}
              </span>
            ) : Icon ? (
              <Icon size={20} className='shrink-0 text-slate-700' />
            ) : null}
            {title}
          </h2>
          {description && !isOpen ? (
            <p className='mt-1 text-sm text-slate-500'>{description}</p>
          ) : null}
        </div>
        <ChevronDown
          size={20}
          className={`mt-1 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen ? (
        <div className='border-t border-slate-100 px-5 pb-5 pt-4'>
          {children}
        </div>
      ) : null}
    </div>
  )
}

export default function StoreShippingSettings() {
  const { getToken } = useAuth()
  const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'AED'
  const emirateOptions = UAE_EMIRATES
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [allProducts, setAllProducts] = useState([])
  const [selectedFreeProducts, setSelectedFreeProducts] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [openSections, setOpenSections] = useState(() => readStoredOpenState(SHIPPING_SECTIONS_STORAGE_KEY))
  const [openDeliveryOptions, setOpenDeliveryOptions] = useState(() => readStoredOpenState(SHIPPING_OPTIONS_STORAGE_KEY))
  const isDirtyRef = useRef(false)
  const hasAppliedServerDataRef = useRef(false)
  const [form, setForm] = useState({
    enabled: true,
    shippingOptions: [createEmptyShippingOption({ isDefault: true })],
    freeShippingMin: 100,
    enableProductSpecificFreeShipping: false,
    localDeliveryFee: '',
    regionalDeliveryFee: '',
    stateCharges: [],
    enableCOD: true,
    enableCard: true,
    enableTabby: true,
    enableTamara: true,
    codFee: 0,
    maxCODAmount: 0,
    maxCardAmount: 0,
    maxTabbyAmount: 0,
    maxTamaraAmount: 0,
  })

  const markDirty = () => {
    isDirtyRef.current = true
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const token = await getToken()
        if (cancelled) return
        if (!token) {
          setLoading(false)
          return
        }

        const [shippingRes, productsRes] = await Promise.all([
          axios.get('/api/shipping', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('/api/store/product', { headers: { Authorization: `Bearer ${token}` } }),
        ])

        if (cancelled || isDirtyRef.current || hasAppliedServerDataRef.current) return

        if (shippingRes.data?.setting) {
          setForm(mapSettingToForm(shippingRes.data.setting))
          hasAppliedServerDataRef.current = true
        }

        if (productsRes.data?.products) {
          setAllProducts(productsRes.data.products)
          setSelectedFreeProducts(
            productsRes.data.products
              .filter((p) => p.freeShippingEligible)
              .map((p) => String(p._id))
          )
        }
      } catch (e) {
        // keep current form values if load fails
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [getToken])

  const isSectionOpen = (sectionId) => Boolean(openSections[sectionId])

  const toggleSection = (sectionId) => {
    setOpenSections((prev) => {
      const next = { ...prev, [sectionId]: !prev[sectionId] }
      persistOpenState(SHIPPING_SECTIONS_STORAGE_KEY, next)
      return next
    })
  }

  const isDeliveryOptionOpen = (optionId) => Boolean(openDeliveryOptions[optionId])

  const toggleDeliveryOption = (optionId) => {
    setOpenDeliveryOptions((prev) => {
      const next = { ...prev, [optionId]: !prev[optionId] }
      persistOpenState(SHIPPING_OPTIONS_STORAGE_KEY, next)
      return next
    })
  }

  const toggleFreeShippingProduct = (productId) => {
    markDirty()
    const id = String(productId);
    setSelectedFreeProducts((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const updateShippingOption = (optionId, patch) => {
    markDirty()
    setForm((prev) => ({
      ...prev,
      shippingOptions: prev.shippingOptions.map((option) =>
        option.id === optionId ? { ...option, ...patch } : option,
      ),
    }));
  };

  const setDefaultShippingOption = (optionId) => {
    markDirty()
    setForm((prev) => ({
      ...prev,
      shippingOptions: prev.shippingOptions.map((option) => ({
        ...option,
        isDefault: option.id === optionId,
      })),
    }));
  };

  const addShippingOption = () => {
    markDirty()
    const newOption = createEmptyShippingOption({
      name: `Delivery Option ${form.shippingOptions.length + 1}`,
      isDefault: form.shippingOptions.length === 0,
      sortOrder: form.shippingOptions.length,
    })

    setForm((prev) => ({
      ...prev,
      shippingOptions: [...prev.shippingOptions, newOption],
    }))

    setOpenDeliveryOptions((openPrev) => {
      const next = { ...openPrev, [newOption.id]: true }
      persistOpenState(SHIPPING_OPTIONS_STORAGE_KEY, next)
      return next
    })
    setOpenSections((sectionPrev) => {
      const next = { ...sectionPrev, 'delivery-options': true }
      persistOpenState(SHIPPING_SECTIONS_STORAGE_KEY, next)
      return next
    })
  }

  const removeShippingOption = (optionId) => {
    markDirty()
    setForm((prev) => {
      const next = prev.shippingOptions.filter((option) => option.id !== optionId);
      if (!next.length) {
        return { ...prev, shippingOptions: [createEmptyShippingOption({ isDefault: true })] };
      }
      if (!next.some((option) => option.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return { ...prev, shippingOptions: next };
    });
  };

  const toggleOptionStateRestriction = (optionId, stateName) => {
    markDirty()
    setForm((prev) => ({
      ...prev,
      shippingOptions: prev.shippingOptions.map((option) => {
        if (option.id !== optionId) return option;
        const current = Array.isArray(option.availableStates) ? option.availableStates : [];
        const exists = current.includes(stateName);
        return {
          ...option,
          availableStates: exists
            ? current.filter((state) => state !== stateName)
            : [...current, stateName],
        };
      }),
    }));
  };

  const renderOptionLogicFields = (option) => {
    if (option.shippingType === 'FLAT_RATE') {
      return (
        <div className='mt-4 rounded-lg bg-slate-50 p-4'>
          <label className='mb-2 block text-sm font-medium text-slate-700'>Flat Rate Fee</label>
          <div className='flex items-center gap-2'>
            <span className='text-slate-600'>{currency}</span>
            <input
              type='number'
              step='0.01'
              value={option.flatRate}
              onChange={(e) => updateShippingOption(option.id, { flatRate: parseOptionalFeeInput(e.target.value) })}
              className='w-40 rounded border border-slate-300 px-3 py-2'
            />
          </div>
        </div>
      );
    }

    if (option.shippingType === 'PER_ITEM') {
      return (
        <div className='mt-4 space-y-3 rounded-lg bg-slate-50 p-4'>
          <div>
            <label className='mb-2 block text-sm font-medium text-slate-700'>Fee Per Item</label>
            <div className='flex items-center gap-2'>
              <span className='text-slate-600'>{currency}</span>
              <input
                type='number'
                step='0.01'
                value={option.perItemFee}
                onChange={(e) => updateShippingOption(option.id, { perItemFee: parseOptionalFeeInput(e.target.value) })}
                className='w-40 rounded border border-slate-300 px-3 py-2'
              />
            </div>
          </div>
          <div>
            <label className='mb-2 block text-sm font-medium text-slate-700'>Maximum Item Fee (Optional)</label>
            <div className='flex items-center gap-2'>
              <span className='text-slate-600'>{currency}</span>
              <input
                type='number'
                step='0.01'
                value={option.maxItemFee}
                onChange={(e) => updateShippingOption(option.id, { maxItemFee: e.target.value })}
                placeholder='No limit'
                className='w-40 rounded border border-slate-300 px-3 py-2'
              />
            </div>
          </div>
        </div>
      );
    }

    if (option.shippingType === 'WEIGHT_BASED') {
      return (
        <div className='mt-4 space-y-3 rounded-lg bg-slate-50 p-4'>
          <div className='flex items-center gap-4'>
            <label className='flex items-center gap-2'>
              <input
                type='radio'
                checked={option.weightUnit === 'kg'}
                onChange={() => updateShippingOption(option.id, { weightUnit: 'kg' })}
                className='accent-slate-700'
              />
              <span className='text-sm text-slate-700'>Kilograms (kg)</span>
            </label>
            <label className='flex items-center gap-2'>
              <input
                type='radio'
                checked={option.weightUnit === 'lb'}
                onChange={() => updateShippingOption(option.id, { weightUnit: 'lb' })}
                className='accent-slate-700'
              />
              <span className='text-sm text-slate-700'>Pounds (lb)</span>
            </label>
          </div>
          <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
            <div>
              <label className='mb-2 block text-sm font-medium text-slate-700'>Base Weight</label>
              <input
                type='number'
                step='0.1'
                value={option.baseWeight}
                onChange={(e) => updateShippingOption(option.id, { baseWeight: parseOptionalFeeInput(e.target.value) })}
                className='w-full rounded border border-slate-300 px-3 py-2'
              />
            </div>
            <div>
              <label className='mb-2 block text-sm font-medium text-slate-700'>Base Weight Fee</label>
              <div className='flex items-center gap-2'>
                <span className='text-slate-600'>{currency}</span>
                <input
                  type='number'
                  step='0.01'
                  value={option.baseWeightFee}
                  onChange={(e) => updateShippingOption(option.id, { baseWeightFee: parseOptionalFeeInput(e.target.value) })}
                  className='w-full rounded border border-slate-300 px-3 py-2'
                />
              </div>
            </div>
            <div>
              <label className='mb-2 block text-sm font-medium text-slate-700'>
                Additional Fee per {option.weightUnit}
              </label>
              <div className='flex items-center gap-2'>
                <span className='text-slate-600'>{currency}</span>
                <input
                  type='number'
                  step='0.01'
                  value={option.additionalWeightFee}
                  onChange={(e) => updateShippingOption(option.id, { additionalWeightFee: parseOptionalFeeInput(e.target.value) })}
                  className='w-full rounded border border-slate-300 px-3 py-2'
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className='mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800'>
        This delivery option is always free for the customer.
      </div>
    );
  };

  const onSave = async () => {
    try {
      if (!form.shippingOptions.some((option) => option.enabled)) {
        toast.error('Enable at least one delivery option before saving.')
        return
      }
      setSaving(true)
      const hasFreeShippingProducts = selectedFreeProducts.length > 0;
      const payload = {
        ...form,
        enableProductSpecificFreeShipping: hasFreeShippingProducts || form.enableProductSpecificFreeShipping,
        productSpecificFreeShippingMode: hasFreeShippingProducts
          ? 'MARKED_ITEMS_ONLY'
          : (form.productSpecificFreeShippingMode || 'ORDER_LEVEL'),
      };
      console.log('Saving form with maxCODAmount:', payload.maxCODAmount, 'Full form:', payload)
      const token = await getToken()
      const response = await axios.put('/api/shipping', payload, { headers: { Authorization: `Bearer ${token}` } })
      console.log('Server response:', response.data)
      await axios.put(
        '/api/store/products/free-shipping',
        { productIds: selectedFreeProducts },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (response.data?.setting) {
        setForm(mapSettingToForm(response.data.setting))
      } else {
        setForm((prev) => ({
          ...prev,
          enableProductSpecificFreeShipping: hasFreeShippingProducts || prev.enableProductSpecificFreeShipping,
        }))
      }
      isDirtyRef.current = false
      hasAppliedServerDataRef.current = true
      toast.success(
        hasFreeShippingProducts
          ? `Shipping settings saved — ${selectedFreeProducts.length} product(s) get free shipping`
          : 'Shipping settings saved'
      )
    } catch (e) {
      console.error('Save error:', e?.response?.data || e.message)
      toast.error(e?.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className='p-6'>Loading...</div>

  const expressOption = findExpressShippingOption(form.shippingOptions)
  const expressEnabled = Boolean(expressOption?.enabled)
  const expressExtraFee = getExpressExtraFee(form.shippingOptions)
  const expressEstimatedDays = expressOption?.estimatedDays || '1-2'

  const setExpressEnabled = (enabled) => {
    markDirty()
    setForm((prev) => ({
      ...prev,
      shippingOptions: upsertExpressShippingOption(prev.shippingOptions, {
        enabled,
        extraFee: getExpressExtraFee(prev.shippingOptions) || 20,
        estimatedDays: findExpressShippingOption(prev.shippingOptions)?.estimatedDays || '1-2',
      }),
    }))
  }

  const setExpressExtraFee = (fee) => {
    markDirty()
    setForm((prev) => ({
      ...prev,
      shippingOptions: upsertExpressShippingOption(prev.shippingOptions, {
        enabled: true,
        extraFee: Number(fee) || 0,
        estimatedDays: findExpressShippingOption(prev.shippingOptions)?.estimatedDays || '1-2',
      }),
    }))
  }

  const setExpressEstimatedDays = (days) => {
    markDirty()
    setForm((prev) => ({
      ...prev,
      shippingOptions: upsertExpressShippingOption(prev.shippingOptions, {
        enabled: expressEnabled || true,
        extraFee: getExpressExtraFee(prev.shippingOptions) || 20,
        estimatedDays: days,
      }),
    }))
  }

  return (
    <div className='p-6 max-w-4xl'>
      <div className='flex items-center gap-3 mb-6'>
        <TruckIcon className='text-slate-700' size={32} />
        <h1 className='text-3xl font-semibold text-slate-800'>Shipping Settings</h1>
      </div>

      <div className='space-y-6'>
        {/* Enable Shipping */}
        <div className='bg-white p-6 rounded-xl border border-slate-200'>
          <label className='flex items-center gap-3 cursor-pointer'>
            <input type='checkbox' checked={form.enabled} 
              onChange={(e) => {
                markDirty()
                setForm((s) => ({ ...s, enabled: e.target.checked }))
              }}
              className='w-5 h-5 accent-slate-700' />
            <div>
              <span className='text-lg font-medium text-slate-700'>Enable Shipping Charges</span>
              <p className='text-sm text-slate-500'>Turn on to charge shipping fees for orders</p>
            </div>
          </label>
        </div>

        {form.enabled && (
          <>
            {/* Delivery Options */}
            <ShippingSection
              title='Delivery Options'
              icon={PackageIcon}
              description={`${form.shippingOptions.length} option(s) configured`}
              isOpen={isSectionOpen('delivery-options')}
              onToggle={() => toggleSection('delivery-options')}
            >
              <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
                <p className='text-sm text-slate-500'>
                  Add multiple delivery methods. Each option can use its own pricing logic.
                </p>
                <button
                  type='button'
                  onClick={addShippingOption}
                  className='inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50'
                >
                  <PlusIcon size={16} /> Add Option
                </button>
              </div>

              <div className='space-y-4'>
                {form.shippingOptions.map((option, index) => {
                  const optionOpen = isDeliveryOptionOpen(option.id)
                  const logicLabel = SHIPPING_LOGIC_LABELS[option.shippingType] || option.shippingType
                  const feeSummary = option.shippingType === 'FLAT_RATE'
                    ? `${currency} ${option.flatRate}`
                    : logicLabel

                  return (
                  <div key={option.id} className='overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40'>
                    <button
                      type='button'
                      onClick={() => toggleDeliveryOption(option.id)}
                      className='flex w-full items-start justify-between gap-3 p-4 text-left transition hover:bg-slate-100/60'
                    >
                      <div className='min-w-0 flex-1'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                            Option {index + 1}
                          </span>
                          {option.isDefault ? (
                            <span className='rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700'>
                              Default
                            </span>
                          ) : null}
                          {!option.enabled ? (
                            <span className='rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800'>
                              Disabled
                            </span>
                          ) : null}
                        </div>
                        <p className='mt-1 truncate text-sm font-semibold text-slate-800'>
                          {option.name || `Delivery Option ${index + 1}`}
                        </p>
                        {!optionOpen ? (
                          <p className='mt-0.5 text-xs text-slate-500'>
                            {logicLabel} · {feeSummary} · {option.estimatedDays || '3-5'} days
                          </p>
                        ) : null}
                      </div>
                      <ChevronDown
                        size={18}
                        className={`mt-1 shrink-0 text-slate-400 transition-transform ${optionOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {optionOpen ? (
                    <div className='border-t border-slate-200 p-4'>
                    <div className='flex flex-wrap items-start justify-between gap-3'>
                      <div className='min-w-0 flex-1'>
                        <label className='mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500'>
                          Option name
                        </label>
                        <input
                          type='text'
                          value={option.name}
                          onChange={(e) => updateShippingOption(option.id, { name: e.target.value })}
                          className='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800'
                          placeholder='e.g. Standard Delivery'
                        />
                      </div>
                      <div className='flex items-center gap-3'>
                        <label className='flex items-center gap-2 text-sm text-slate-700'>
                          <input
                            type='checkbox'
                            checked={option.enabled}
                            onChange={(e) => updateShippingOption(option.id, { enabled: e.target.checked })}
                            className='accent-slate-700'
                          />
                          Enabled
                        </label>
                        <label className='flex items-center gap-2 text-sm text-slate-700'>
                          <input
                            type='radio'
                            name='defaultShippingOption'
                            checked={option.isDefault}
                            onChange={() => setDefaultShippingOption(option.id)}
                            className='accent-slate-700'
                          />
                          Default
                        </label>
                        {form.shippingOptions.length > 1 ? (
                          <button
                            type='button'
                            onClick={() => removeShippingOption(option.id)}
                            className='rounded-lg p-2 text-red-600 transition hover:bg-red-50'
                            aria-label={`Remove ${option.name}`}
                          >
                            <Trash2Icon size={16} />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className='mt-4 grid grid-cols-1 gap-3 md:grid-cols-2'>
                      <div>
                        <label className='mb-2 block text-sm font-medium text-slate-700'>Estimated Delivery Days</label>
                        <input
                          type='text'
                          value={option.estimatedDays}
                          onChange={(e) => updateShippingOption(option.id, { estimatedDays: e.target.value })}
                          placeholder='e.g. 3-5'
                          className='w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm'
                        />
                      </div>
                    </div>

                    <div className='mt-4'>
                      <label className='mb-2 block text-sm font-medium text-slate-700'>Pricing Logic</label>
                      <div className='grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4'>
                        {Object.entries(SHIPPING_LOGIC_LABELS).map(([value, label]) => (
                          <label
                            key={value}
                            className={`cursor-pointer rounded-lg border-2 p-3 transition ${
                              option.shippingType === value
                                ? 'border-slate-700 bg-white'
                                : 'border-slate-200 bg-white hover:border-slate-400'
                            }`}
                          >
                            <input
                              type='radio'
                              name={`shippingType-${option.id}`}
                              value={value}
                              checked={option.shippingType === value}
                              onChange={() => updateShippingOption(option.id, { shippingType: value })}
                              className='sr-only'
                            />
                            <span className='text-sm font-medium text-slate-700'>{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {renderOptionLogicFields(option)}

                    <div className='mt-4'>
                      <label className='mb-2 block text-sm font-medium text-slate-700'>
                        Emirate Restrictions (Optional)
                      </label>
                      <p className='mb-2 text-xs text-slate-500'>
                        Leave empty to show this option in all UAE emirates. Select emirates to limit availability.
                      </p>
                      <div className='flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3'>
                        {emirateOptions.map((emirateName) => {
                          const selected = (option.availableStates || []).includes(emirateName);
                          return (
                            <button
                              key={`${option.id}-${emirateName}`}
                              type='button'
                              onClick={() => toggleOptionStateRestriction(option.id, emirateName)}
                              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                                selected
                                  ? 'border-slate-700 bg-slate-700 text-white'
                                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-400'
                              }`}
                            >
                              {emirateName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    </div>
                    ) : null}
                  </div>
                  )
                })}
              </div>
            </ShippingSection>

            {/* Product-specific free shipping */}
            <ShippingSection
              title='Free Shipping by Product'
              icon={PackageIcon}
              description={`${selectedFreeProducts.length} product(s) with free shipping`}
              isOpen={isSectionOpen('free-shipping-products')}
              onToggle={() => toggleSection('free-shipping-products')}
            >
                <p className='text-sm text-slate-500 mb-4'>
                  Select products that should always ship free. Only these products get free delivery; other products use the standard fee below the threshold.
                </p>

                {selectedFreeProducts.length > 0 && (
                  <div className='flex flex-wrap gap-2 mb-4'>
                    {selectedFreeProducts.map((id) => {
                      const p = allProducts.find((x) => String(x._id) === id)
                      if (!p) return null
                      return (
                        <span key={id} className='flex items-center gap-1.5 bg-emerald-50 text-emerald-800 text-xs font-medium px-2.5 py-1 rounded-full border border-emerald-200'>
                          {p.name}
                          <button
                            type='button'
                            onClick={() => toggleFreeShippingProduct(id)}
                            className='hover:text-emerald-600'
                            aria-label={`Remove ${p.name}`}
                          >
                            <XIcon size={12} />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}

                <div className='relative mb-2'>
                  <SearchIcon size={14} className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-400' />
                  <input
                    type='text'
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder='Search products to add free shipping...'
                    className='w-full border border-slate-300 rounded-lg px-3 py-2.5 pl-8 text-sm'
                  />
                </div>

                <div className='max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100'>
                  {allProducts
                    .filter((p) => p.name?.toLowerCase().includes(productSearch.toLowerCase()))
                    .map((p) => {
                      const id = String(p._id)
                      const checked = selectedFreeProducts.includes(id)
                      const thumb = Array.isArray(p.images) && p.images[0] ? p.images[0] : null
                      return (
                        <label
                          key={id}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 ${checked ? 'bg-emerald-50/70' : ''}`}
                        >
                          <input
                            type='checkbox'
                            checked={checked}
                            onChange={() => toggleFreeShippingProduct(id)}
                            className='accent-emerald-600'
                          />
                          {thumb ? (
                            <img src={thumb} alt='' className='h-9 w-9 rounded object-cover border border-slate-200' />
                          ) : (
                            <div className='h-9 w-9 rounded bg-slate-100 border border-slate-200' />
                          )}
                          <span className='text-sm text-slate-700 flex-1 min-w-0 truncate'>{p.name}</span>
                          {checked ? (
                            <span className='text-xs text-emerald-700 font-semibold shrink-0'>Free shipping</span>
                          ) : null}
                        </label>
                      )
                    })}
                  {allProducts.filter((p) => p.name?.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                    <p className='text-sm text-slate-400 text-center py-6'>No products found</p>
                  )}
                </div>
                <p className='text-xs text-slate-500 mt-3'>
                  {selectedFreeProducts.length} product(s) selected — only these products get free delivery. Other products use the standard delivery fee below the free-shipping threshold.
                </p>
            </ShippingSection>

            {/* Free Shipping Threshold */}
            <ShippingSection
              title='Free Shipping Threshold'
              iconLabel={currency}
              description={`${currency} ${form.freeShippingMin} minimum for free shipping`}
              isOpen={isSectionOpen('free-shipping-threshold')}
              onToggle={() => toggleSection('free-shipping-threshold')}
            >
                <div>
                  <label className='block text-sm font-medium text-slate-700 mb-2'>Minimum Order Amount for Free Shipping</label>
                  <div className='flex items-center gap-2'>
                    <span className='text-slate-600'>{currency}</span>
                    <input type='number' step='0.01' value={form.freeShippingMin}
                      onChange={(e) => {
                        markDirty()
                        setForm((s) => ({ ...s, freeShippingMin: parseOptionalFeeInput(e.target.value) }))
                      }}
                      className='w-48 border border-slate-300 rounded px-3 py-2' />
                  </div>
                  <p className='text-xs text-slate-500 mt-2'>Orders at or above this amount get free shipping on non-selected products (flat-rate delivery)</p>
                </div>
            </ShippingSection>

            {/* Regional Settings */}
            <ShippingSection
              title='Regional Delivery Fees (Optional)'
              description='Local and regional delivery overrides'
              isOpen={isSectionOpen('regional-fees')}
              onToggle={() => toggleSection('regional-fees')}
            >
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div>
                  <label className='block text-sm font-medium text-slate-700 mb-2'>Local Delivery Fee</label>
                  <div className='flex items-center gap-2'>
                    <span className='text-slate-600'>{currency}</span>
                    <input type='number' step='0.01' value={form.localDeliveryFee}
                      onChange={(e) => {
                        markDirty()
                        setForm((s) => ({ ...s, localDeliveryFee: e.target.value }))
                      }}
                      placeholder='Leave empty to use default'
                      className='w-48 border border-slate-300 rounded px-3 py-2' />
                  </div>
                  <p className='text-xs text-slate-500 mt-1'>Special fee for local deliveries</p>
                </div>
                <div>
                  <label className='block text-sm font-medium text-slate-700 mb-2'>Regional Delivery Fee</label>
                  <div className='flex items-center gap-2'>
                    <span className='text-slate-600'>{currency}</span>
                    <input type='number' step='0.01' value={form.regionalDeliveryFee}
                      onChange={(e) => {
                        markDirty()
                        setForm((s) => ({ ...s, regionalDeliveryFee: e.target.value }))
                      }}
                      placeholder='Leave empty to use default'
                      className='w-48 border border-slate-300 rounded px-3 py-2' />
                  </div>
                  <p className='text-xs text-slate-500 mt-1'>Special fee for regional deliveries</p>
                </div>
              </div>
            </ShippingSection>

            {/* Express Shipping */}
            <ShippingSection
              title='Express Shipping'
              description={expressEnabled ? `Enabled · ${currency} ${expressExtraFee} extra` : 'Disabled'}
              isOpen={isSectionOpen('express-shipping')}
              onToggle={() => toggleSection('express-shipping')}
            >
              <label className='flex items-center gap-3 mb-4 cursor-pointer'>
                <input
                  type='checkbox'
                  checked={expressEnabled}
                  onChange={(e) => setExpressEnabled(e.target.checked)}
                  className='w-5 h-5 accent-slate-700'
                />
                <span className='text-slate-700'>Enable express/priority shipping option</span>
              </label>
              {expressEnabled ? (
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-2'>Express Shipping Fee</label>
                    <div className='flex items-center gap-2'>
                      <span className='text-slate-600'>{currency}</span>
                      <input
                        type='number'
                        step='0.01'
                        value={expressExtraFee}
                        onChange={(e) => setExpressExtraFee(parseOptionalFeeInput(e.target.value))}
                        className='w-40 border border-slate-300 rounded px-3 py-2'
                      />
                    </div>
                    <p className='text-xs text-slate-500 mt-2'>
                      Extra fee on top of standard shipping. Shown as a separate option at checkout.
                    </p>
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-2'>Express Delivery Days</label>
                    <input
                      type='text'
                      value={expressEstimatedDays}
                      onChange={(e) => setExpressEstimatedDays(e.target.value)}
                      placeholder='e.g. 1-2 or Next Day Delivery'
                      className='w-full border border-slate-300 rounded px-3 py-2'
                    />
                  </div>
                </div>
              ) : null}
            </ShippingSection>

            {/* COD Settings */}
            <ShippingSection
              title='Cash on Delivery (COD)'
              description={form.enableCOD ? `Enabled · max ${currency} ${form.maxCODAmount || 'unlimited'}` : 'Disabled'}
              isOpen={isSectionOpen('cod-settings')}
              onToggle={() => toggleSection('cod-settings')}
            >
              <label className='flex items-center gap-3 mb-4 cursor-pointer'>
                <input type='checkbox' checked={form.enableCOD}
                  onChange={(e) => {
                    markDirty()
                    setForm((s) => ({ ...s, enableCOD: e.target.checked }))
                  }}
                  className='w-5 h-5 accent-slate-700' />
                <span className='text-slate-700'>Enable COD payment method</span>
              </label>
              {form.enableCOD && (
                <div className='space-y-4'>
                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-2'>COD Processing Fee</label>
                    <div className='flex items-center gap-2'>
                      <span className='text-slate-600'>{currency}</span>
                      <input type='number' step='0.01' value={form.codFee}
                        onChange={(e) => {
                          markDirty()
                          setForm((s) => ({ ...s, codFee: parseOptionalFeeInput(e.target.value) }))
                        }}
                        className='w-40 border border-slate-300 rounded px-3 py-2' />
                    </div>
                    <p className='text-xs text-slate-500 mt-2'>Additional fee for COD orders (use 0 for no fee)</p>
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-2'>Maximum COD Amount</label>
                    <div className='flex items-center gap-2'>
                      <span className='text-slate-600'>{currency}</span>
                      <input type='number' step='0.01' value={form.maxCODAmount || ''}
                        onChange={(e) => {
                          markDirty()
                          setForm((s) => ({ ...s, maxCODAmount: parseOptionalFeeInput(e.target.value) }))
                        }}
                        className='w-40 border border-slate-300 rounded px-3 py-2' />
                    </div>
                    <p className='text-xs text-slate-500 mt-2'>Max order total for COD (use 0 for unlimited)</p>
                  </div>
                </div>
              )}
            </ShippingSection>

            {/* Online payment methods + limits */}
            <ShippingSection
              title='Online Payment Methods'
              description={
                [
                  form.enableCard !== false ? 'Card' : null,
                  form.enableTabby !== false ? 'Tabby' : null,
                  form.enableTamara !== false ? 'Tamara' : null,
                ].filter(Boolean).join(' · ') || 'All disabled'
              }
              isOpen={isSectionOpen('payment-limits')}
              onToggle={() => toggleSection('payment-limits')}
            >
              <p className='text-sm text-slate-500 mb-4'>
                Enable or disable methods on the storefront, and set optional order-total limits. Use 0 for unlimited.
                You can also manage these toggles under Settings → Payments.
              </p>
              <div className='mb-5 space-y-3'>
                <label className='flex items-center gap-3 cursor-pointer'>
                  <input
                    type='checkbox'
                    checked={form.enableCard !== false}
                    onChange={(e) => {
                      markDirty()
                      setForm((s) => ({ ...s, enableCard: e.target.checked }))
                    }}
                    className='w-5 h-5 accent-slate-700'
                  />
                  <span className='text-slate-700'>Enable Card payment</span>
                </label>
                <label className='flex items-center gap-3 cursor-pointer'>
                  <input
                    type='checkbox'
                    checked={form.enableTabby !== false}
                    onChange={(e) => {
                      markDirty()
                      setForm((s) => ({ ...s, enableTabby: e.target.checked }))
                    }}
                    className='w-5 h-5 accent-slate-700'
                  />
                  <span className='text-slate-700'>Enable Tabby</span>
                </label>
                <label className='flex items-center gap-3 cursor-pointer'>
                  <input
                    type='checkbox'
                    checked={form.enableTamara !== false}
                    onChange={(e) => {
                      markDirty()
                      setForm((s) => ({ ...s, enableTamara: e.target.checked }))
                    }}
                    className='w-5 h-5 accent-slate-700'
                  />
                  <span className='text-slate-700'>Enable Tamara</span>
                </label>
              </div>
              <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
                <div>
                  <label className='block text-sm font-medium text-slate-700 mb-2'>Maximum Card Amount</label>
                  <div className='flex items-center gap-2'>
                    <span className='text-slate-600'>{currency}</span>
                    <input
                      type='number'
                      step='0.01'
                      value={form.maxCardAmount || ''}
                      onChange={(e) => {
                        markDirty()
                        setForm((s) => ({ ...s, maxCardAmount: parseOptionalFeeInput(e.target.value) }))
                      }}
                      className='w-full border border-slate-300 rounded px-3 py-2'
                    />
                  </div>
                </div>
                <div>
                  <label className='block text-sm font-medium text-slate-700 mb-2'>Maximum Tabby Amount</label>
                  <div className='flex items-center gap-2'>
                    <span className='text-slate-600'>{currency}</span>
                    <input
                      type='number'
                      step='0.01'
                      value={form.maxTabbyAmount || ''}
                      onChange={(e) => {
                        markDirty()
                        setForm((s) => ({ ...s, maxTabbyAmount: parseOptionalFeeInput(e.target.value) }))
                      }}
                      className='w-full border border-slate-300 rounded px-3 py-2'
                    />
                  </div>
                </div>
                <div>
                  <label className='block text-sm font-medium text-slate-700 mb-2'>Maximum Tamara Amount</label>
                  <div className='flex items-center gap-2'>
                    <span className='text-slate-600'>{currency}</span>
                    <input
                      type='number'
                      step='0.01'
                      value={form.maxTamaraAmount || ''}
                      onChange={(e) => {
                        markDirty()
                        setForm((s) => ({ ...s, maxTamaraAmount: parseOptionalFeeInput(e.target.value) }))
                      }}
                      className='w-full border border-slate-300 rounded px-3 py-2'
                    />
                  </div>
                </div>
              </div>
              <p className='text-xs text-slate-500 mt-3'>
                Example: set Tabby to 3000 — orders above AED 3000 will not show Tabby at checkout.
              </p>
            </ShippingSection>
          </>
        )}

        {/* Save Button */}
        <div className='flex justify-end'>
          <button onClick={onSave} disabled={saving}
            className='inline-flex items-center gap-2 bg-slate-700 text-white px-6 py-3 rounded-lg hover:bg-slate-900 disabled:opacity-60 transition font-medium'>
            <SaveIcon size={18} /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

