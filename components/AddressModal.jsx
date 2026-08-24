'use client'
import { addAddress, fetchAddress } from "@/lib/features/address/addressSlice"

import axios from "axios"
import { Check, MapPin, Pencil, Phone, Plus, Trash2, User, XIcon } from "lucide-react"
import { useState, useEffect } from "react"
import { toast } from "react-hot-toast"
import { useDispatch } from "react-redux"

import { useAuth } from '@/lib/useAuth';
import { UAE_EMIRATES, getUaeAreaOptionsForEmirate, isUaeCountry } from '@/lib/uaeEmirateAreas';
import SearchableSelect from '@/components/SearchableSelect';
import PhoneNumberField from '@/components/PhoneNumberField';
import { UAE_PHONE_CODE_OPTIONS } from '@/assets/countryCodes';
import {
    validateAddressPayload,
} from '@/lib/addressValidation';
import {
    getPhoneInputError,
    getPhoneValidationMessage,
    isValidPhoneNumber,
} from '@/lib/phoneValidation';

const indianStates = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh"
];

function formatLocationLine(addr) {
    const parts = [addr?.city, addr?.district, addr?.state]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

    const seen = new Set();
    return parts
        .filter((part) => {
            const key = part.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .join(', ');
}

function formatPhoneLine(addr) {
    const code = String(addr?.phoneCode || '+971').trim();
    const phone = String(addr?.phone || '').trim();
    if (!phone) return '';
    return `${code} ${phone}`;
}

function resolveAddressCity(addr) {
    return String(addr?.district || addr?.state || addr?.city || '').trim();
}

const AddressModal = ({ open, setShowAddressModal, onAddressAdded, initialAddress = null, isEdit = false, onAddressUpdated, onAddressDeleted, addressList = [], onSelectAddress, selectedAddressId, allowGuest = false }) => {
    const { user, getToken } = useAuth()
    const dispatch = useDispatch()
    
    const [mode, setMode] = useState('select') // 'select' or 'form'
    const [editingAddress, setEditingAddress] = useState(null) // Track which address is being edited
    const [pincodeLoading, setPincodeLoading] = useState(false)
    const [pincodeError, setPincodeError] = useState('')
    const [areaError, setAreaError] = useState('')
    const [pendingAddressId, setPendingAddressId] = useState(selectedAddressId || null)
    const [deletingAddressId, setDeletingAddressId] = useState(null)

    const [address, setAddress] = useState({
        name: '',
        email: '',
        street: '',
        city: '',
        state: '',
        district: '',
        zip: '',
        country: 'United Arab Emirates',
        phone: '',
        phoneCode: '+971',
        alternatePhone: '',
        alternatePhoneCode: '+971',
        id: null,
    })
    
    // Set mode based on props
    useEffect(() => {
        if (open) {
            setPendingAddressId(selectedAddressId || addressList[0]?._id || null);
            if (isEdit || addressList.length === 0) {
                setMode('form');
            } else {
                setMode('select');
                setEditingAddress(null);
            }
        }
    }, [isEdit, addressList, open, selectedAddressId]);

    useEffect(() => {
        if (!pendingAddressId) return;
        const stillExists = addressList.some((addr) => addr._id === pendingAddressId);
        if (!stillExists) {
            setPendingAddressId(addressList[0]?._id || null);
        }
    }, [addressList, pendingAddressId]);

    const handleDeleteAddress = async (addr) => {
        const addressId = addr?._id || addr?.id;
        if (!addressId) return;

        const confirmed = window.confirm('Delete this address? This cannot be undone.');
        if (!confirmed) return;

        try {
            setDeletingAddressId(addressId);

            if (allowGuest && (!user || !user.uid)) {
                if (pendingAddressId === addressId) {
                    const nextId = addressList.find((item) => item._id !== addressId)?._id || null;
                    setPendingAddressId(nextId);
                }
                toast.success('Address deleted');
                onAddressDeleted?.(addressId);
                return;
            }

            const token = await getToken();
            await axios.delete(`/api/address/${encodeURIComponent(String(addressId))}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (pendingAddressId === addressId) {
                const nextId = addressList.find((item) => item._id !== addressId)?._id || null;
                setPendingAddressId(nextId);
            }

            dispatch(fetchAddress({ getToken }));
            toast.success('Address deleted');
            onAddressDeleted?.(addressId);
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to delete address');
        } finally {
            setDeletingAddressId(null);
        }
    };

    // Prefill when editing or reset when adding new
    useEffect(() => {
        const addressToEdit = editingAddress || initialAddress;
        if ((isEdit || editingAddress) && addressToEdit) {
            // Extract phone number without country code if present
            let phoneNumber = addressToEdit.phone || '';
            // If phone starts with +, remove country code part
            if (phoneNumber.startsWith('+')) {
                // Remove country code (everything before the actual number)
                phoneNumber = phoneNumber.replace(/^\+\d+/, '').trim();
            }
            
            setAddress({
                id: addressToEdit.id || addressToEdit._id || null,
                name: addressToEdit.name || '',
                email: addressToEdit.email || '',
                street: addressToEdit.street || '',
                city: addressToEdit.city || '',
                state: addressToEdit.state || '',
                district: addressToEdit.district || '',
                zip: addressToEdit.zip || '',
                country: addressToEdit.country || 'United Arab Emirates',
                phone: phoneNumber,
                phoneCode: addressToEdit.phoneCode || '+971',
                alternatePhone: addressToEdit.alternatePhone || '',
                alternatePhoneCode: addressToEdit.alternatePhoneCode || addressToEdit.phoneCode || '+971',
            })
        } else if (!isEdit && !editingAddress) {
            // Reset form when adding new address
            setAddress({
                name: '',
                email: '',
                street: '',
                city: '',
                state: '',
                district: '',
                zip: '',
                country: 'United Arab Emirates',
                phone: '',
                phoneCode: '+971',
                alternatePhone: '',
                alternatePhoneCode: '+971',
                id: null,
            })
            setAreaError('')
        }
    }, [isEdit, initialAddress, editingAddress])

    const countries = [
        { name: 'United Arab Emirates', code: '+971' },
        { name: 'India', code: '+91' },
        { name: 'Saudi Arabia', code: '+966' },
        { name: 'Qatar', code: '+974' },
        { name: 'Kuwait', code: '+965' },
        { name: 'Bahrain', code: '+973' },
        { name: 'Oman', code: '+968' },
        { name: 'Pakistan', code: '+92' },
    ];

    const handleAddressChange = (e) => {
        const { name, value } = e.target
        if (name === 'country') {
            const selectedCountry = countries.find(c => c.name === value)
            setAddress({
                ...address,
                country: value,
                state: '',
                district: '',
                zip: '',
                phoneCode: selectedCountry?.code || '+971',
            })
            setPincodeError('')
        } else if (name === 'state') {
            setAddress({
                ...address,
                state: value,
                district: '',
            })
            setAreaError('')
        } else {
            setAddress({
                ...address,
                [name]: value
            })
            if (name === 'district') {
                setAreaError('')
            }
        }
    }

    // Fetch pincode details from API
    const handlePincodeSearch = async (e) => {
        const rawValue = e.target.value;
        const pincode = address.country === 'India'
            ? rawValue.replace(/\D/g, '').slice(0, 6)
            : rawValue.slice(0, 12);

        setAddress({
            ...address,
            zip: pincode
        });

        if (address.country !== 'India') {
            setPincodeError('');
            return;
        }
        
        if (!pincode || pincode.length < 6) {
            setPincodeError('');
            return;
        }

        setPincodeLoading(true);
        setPincodeError('');
        
        try {
            // Using India Post API for pincode lookup
            const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
            const data = await response.json();
            
            if (data[0].Status === 'Success' && data[0].PostOffice && data[0].PostOffice.length > 0) {
                const postOffice = data[0].PostOffice[0];
                
                // Auto-fill city, state, and district
                setAddress(prev => ({
                    ...prev,
                    city: postOffice.Block || postOffice.District || prev.city,
                    state: postOffice.State || prev.state,
                    district: postOffice.District || prev.district,
                    zip: pincode
                }));
                setPincodeError('');
            } else {
                setPincodeError('Pincode not found. Please enter a valid pincode.');
            }
        } catch (error) {
            console.error('Pincode fetch error:', error);
            setPincodeError('Unable to fetch pincode details. Please enter manually.');
        } finally {
            setPincodeLoading(false);
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            const isGuestSave = allowGuest && (!user || !user.uid);
            if (!isGuestSave && (!user || !user.uid)) {
                toast.error('User not authenticated. Please sign in again.');
                return;
            }

            if (isGuestSave && !String(address.email || '').trim()) {
                toast.error('Please enter your email address.');
                return;
            }

            // Clean and validate phone number
            const cleanedPhone = address.phone.replace(/[^0-9]/g, '');
            
            if (!isValidPhoneNumber(cleanedPhone, address.phoneCode)) {
                toast.error(getPhoneInputError(cleanedPhone, address.phoneCode) || getPhoneValidationMessage(address.phoneCode));
                return;
            }

            const normalizedZip = String(address.zip || '').replace(/\s/g, '');
            if (normalizedZip && /^0+$/.test(normalizedZip)) {
                toast.error('Please enter a valid pincode. All-zero values are not allowed.');
                return;
            }

            if ((address.country || 'United Arab Emirates') === 'India') {
                if (!/^[1-9][0-9]{5}$/.test(normalizedZip)) {
                    toast.error('Please enter a valid 6-digit Indian pincode.');
                    return;
                }
            }

            const addressForValidation = {
                ...address,
                zip: normalizedZip,
                phone: cleanedPhone,
            };
            const validationError = validateAddressPayload(addressForValidation);
            if (validationError) {
                if (validationError.field === 'district') {
                    setAreaError(validationError.message);
                }
                toast.error(validationError.message);
                return;
            }
            
            const token = isGuestSave ? null : await getToken()
            
            // Prepare address data with userId from authenticated user
            const addressData = { ...address, phone: cleanedPhone };
            if (!isGuestSave) {
                addressData.userId = user.uid;
            }
            addressData.city = resolveAddressCity(address);
            addressData.zip = normalizedZip;
            delete addressData.alternatePhone;
            delete addressData.alternatePhoneCode;
            
            if (!addressData.zip || addressData.zip.trim() === '') {
                delete addressData.zip
            }

            if (isGuestSave) {
                const localAddress = {
                    ...addressData,
                    _id: addressData.id || `guest-${Date.now().toString(36)}`,
                    id: addressData.id || undefined,
                };
                localAddress.id = localAddress._id;

                if ((isEdit || editingAddress) && addressData.id) {
                    toast.success('Address updated');
                    onAddressUpdated?.(localAddress);
                } else {
                    toast.success('Address saved');
                    onAddressAdded?.(localAddress);
                }
            } else if (isEdit && addressData.id) {
                const { data } = await axios.put('/api/address', { id: addressData.id, address: addressData }, { headers: { Authorization: `Bearer ${token}` } })
                toast.success(data.message || 'Address updated')
                if (onAddressUpdated) {
                    onAddressUpdated(data.updated)
                }
            } else {
                const { data } = await axios.post('/api/address', {address: addressData}, {headers: { Authorization: `Bearer ${token}` } })
                dispatch(addAddress(data.newAddress))
                // Immediately refresh address list in Redux after adding
                dispatch(fetchAddress({ getToken }))
                toast.success(data.message)
                if (onAddressAdded) {
                    onAddressAdded(data.newAddress);
                }
            }
            setAreaError('')
            setShowAddressModal(false)
            // Reset form state after save
            setAddress({
                name: '',
                email: '',
                street: '',
                city: '',
                state: '',
                district: '',
                zip: '',
                country: 'United Arab Emirates',
                phone: '',
                phoneCode: '+971',
                alternatePhone: '',
                alternatePhoneCode: '+971',
                id: null,
            })
        } catch (error) {
            console.log(error)
            toast.error(error?.response?.data?.error || error?.response?.data?.message || error.message)
        }
    }

    if (!open) return null;

    const handleConfirmSelection = () => {
        if (!pendingAddressId) {
            toast.error('Please choose a delivery address');
            return;
        }
        if (onSelectAddress) {
            onSelectAddress(pendingAddressId);
        }
        setShowAddressModal(false);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/55 p-0 sm:items-center sm:p-4 backdrop-blur-md"
            onClick={() => setShowAddressModal(false)}
            role="presentation"
        >
            <div
                className="my-0 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] border border-white/60 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)] sm:my-8 sm:max-w-2xl sm:rounded-[24px]"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="address-modal-title"
            >
                {/* Header */}
                <div className="relative border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 py-5 sm:px-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <span className="inline-flex items-center rounded-full bg-[#FEECEB] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#E52721]">
                                Delivery
                            </span>
                            <h2 id="address-modal-title" className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                                {mode === 'select' ? 'Choose delivery address' : (isEdit || editingAddress ? 'Update address' : 'Add new address')}
                            </h2>
                            <p className="mt-1 text-sm leading-relaxed text-slate-500">
                                {mode === 'select'
                                    ? 'Pick where your order should be delivered.'
                                    : 'Add accurate details so your order arrives without delays.'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowAddressModal(false)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                            aria-label="Close"
                        >
                            <XIcon size={20} />
                        </button>
                    </div>
                </div>
                
                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {mode === 'select' ? (
                        <div className="flex min-h-0 flex-1 flex-col">
                            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <h3 className="text-sm font-semibold text-slate-800">Saved addresses</h3>
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                        {addressList.length}
                                    </span>
                                </div>

                                {addressList.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                                        <MapPin className="mx-auto h-8 w-8 text-slate-300" />
                                        <p className="mt-3 text-sm font-medium text-slate-700">No saved addresses yet</p>
                                        <p className="mt-1 text-sm text-slate-500">Add your first delivery address to continue.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {addressList.map((addr) => {
                                            const isSelected = pendingAddressId === addr._id;
                                            const locationLine = formatLocationLine(addr);
                                            const phoneLine = formatPhoneLine(addr);

                                            return (
                                                <div
                                                    key={addr._id}
                                                    role="button"
                                                    tabIndex={0}
                                                    className={`w-full cursor-pointer rounded-2xl border p-4 text-left transition-all ${
                                                        isSelected
                                                            ? 'border-[#E52721] bg-[#FFF5F5] shadow-[0_8px_24px_rgba(229,39,33,0.12)]'
                                                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                                    }`}
                                                    onClick={() => setPendingAddressId(addr._id)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            setPendingAddressId(addr._id);
                                                        }
                                                    }}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                                            isSelected ? 'border-[#E52721] bg-[#E52721]' : 'border-slate-300 bg-white'
                                                        }`}>
                                                            {isSelected ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
                                                        </div>

                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                                                                        <User className="h-4 w-4 shrink-0 text-slate-400" />
                                                                        {addr.name}
                                                                    </span>
                                                                    {isSelected ? (
                                                                        <span className="rounded-full bg-[#E52721] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                                                            Selected
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                                <div className="flex shrink-0 items-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-[#E52721]/30 hover:text-[#E52721]"
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        setEditingAddress(addr);
                                                                        setMode('form');
                                                                    }}
                                                                >
                                                                    <Pencil className="h-3 w-3" />
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={deletingAddressId === addr._id}
                                                                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        handleDeleteAddress(addr);
                                                                    }}
                                                                    aria-label={`Delete address for ${addr.name}`}
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                    {deletingAddressId === addr._id ? 'Deleting…' : 'Delete'}
                                                                </button>
                                                                </div>
                                                            </div>

                                                            <div className="mt-2 space-y-1 text-sm text-slate-600">
                                                                <p className="flex items-start gap-2">
                                                                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#E52721]" />
                                                                    <span>
                                                                        <span className="block font-medium text-slate-800">{addr.street}</span>
                                                                        {locationLine ? <span className="block">{locationLine}</span> : null}
                                                                        <span className="block">{addr.country}{addr.zip || addr.pincode ? ` · ${addr.zip || addr.pincode}` : ''}</span>
                                                                    </span>
                                                                </p>
                                                                {phoneLine ? (
                                                                    <p className="flex items-center gap-2 pl-6">
                                                                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                                                                        <span className="font-medium text-slate-700">{phoneLine}</span>
                                                                    </p>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#E52721]/40 bg-[#FFF8F8] px-4 py-3.5 text-sm font-semibold text-[#E52721] transition hover:border-[#E52721] hover:bg-[#FEECEB]"
                                    onClick={() => {
                                        setEditingAddress(null);
                                        setMode('form');
                                    }}
                                >
                                    <Plus className="h-4 w-4" />
                                    Add new address
                                </button>
                            </div>

                            <div className="border-t border-slate-100 bg-white p-4 sm:p-5">
                                <button
                                    type="button"
                                    onClick={handleConfirmSelection}
                                    disabled={!pendingAddressId}
                                    className="w-full rounded-xl bg-[#E52721] py-3.5 text-sm font-bold text-white transition hover:bg-[#C41F1A] disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                    Deliver to this address
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Address Form */
                        <form onSubmit={e => toast.promise(handleSubmit(e), { loading: 'Adding Address...' })} className="p-6 md:p-7">
                    <div className="grid gap-5">
                    <div className="grid gap-5 rounded-[24px] border border-[#f1e4d3] bg-white/88 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)] md:p-6">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Contact information</h3>
                                <p className="mt-1 text-sm text-slate-500">Who should receive delivery and order updates?</p>
                            </div>
                            <span className="rounded-full bg-[#fff5db] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#b45309]">
                                Step 1
                            </span>
                        </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Full Name</label>
                        <input 
                            name="name" 
                            onChange={handleAddressChange} 
                            value={address.name} 
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#f59e0b] focus:bg-white focus:ring-4 focus:ring-[#fde7c2]" 
                            type="text" 
                            placeholder="Enter your name" 
                            required 
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Email Address</label>
                        <input 
                            name="email" 
                            onChange={handleAddressChange} 
                            value={address.email} 
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#f59e0b] focus:bg-white focus:ring-4 focus:ring-[#fde7c2]" 
                            type="email" 
                            placeholder="Email address" 
                            required={allowGuest} 
                        />
                    </div>

                    <PhoneNumberField
                        id="address-phone"
                        label="Phone Number"
                        phone={address.phone}
                        phoneCode={address.phoneCode}
                        onPhoneChange={(value) => setAddress((prev) => ({ ...prev, phone: value }))}
                        onPhoneCodeChange={handleAddressChange}
                        countryOptions={UAE_PHONE_CODE_OPTIONS}
                        inputKey={address.id || 'new'}
                    />
                    </div>

                    <div className="grid gap-5 rounded-[24px] border border-[#f1e4d3] bg-white/88 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)] md:p-6">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Address details</h3>
                                <p className="mt-1 text-sm text-slate-500">Make sure this matches the exact drop-off location.</p>
                            </div>
                            <span className="rounded-full bg-[#fff5db] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#b45309]">
                                Step 2
                            </span>
                        </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Street name, building number, apartment number</label>
                        <input 
                            name="street" 
                            onChange={handleAddressChange} 
                            value={address.street} 
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#f59e0b] focus:bg-white focus:ring-4 focus:ring-[#fde7c2]" 
                            type="text" 
                            placeholder="Street name, building number, apartment number" 
                            required 
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-semibold text-slate-700">{isUaeCountry(address.country) ? 'Emirate' : 'State'}</label>
                        {(address.country === 'India' || isUaeCountry(address.country)) ? (
                            <SearchableSelect
                                value={address.state}
                                onChange={(value) => setAddress({ ...address, state: value, district: '' })}
                                options={isUaeCountry(address.country) ? UAE_EMIRATES : indianStates}
                                placeholder={isUaeCountry(address.country) ? 'Select Emirate' : 'Select State'}
                                searchPlaceholder={isUaeCountry(address.country) ? 'Search emirate...' : 'Search state...'}
                                emptyMessage="No matches found"
                                required
                            />
                        ) : (
                            <input
                                name="state"
                                onChange={handleAddressChange}
                                value={address.state}
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#f59e0b] focus:bg-white focus:ring-4 focus:ring-[#fde7c2]"
                                type="text"
                                placeholder="State/Region"
                                required
                            />
                        )}
                    </div>

                    {isUaeCountry(address.country) && address.state ? (
                        <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Select area</label>
                            <SearchableSelect
                                value={address.district}
                                onChange={(value) => {
                                    setAreaError('');
                                    setAddress({ ...address, district: value });
                                }}
                                options={getUaeAreaOptionsForEmirate(address.state, address.district)}
                                placeholder="Select area"
                                searchPlaceholder="Search area..."
                                emptyMessage="No areas found"
                                listHint={`Showing ${getUaeAreaOptionsForEmirate(address.state, address.district).length} areas in ${address.state} — scroll or type to search`}
                                allowCustomValue
                                formatCustomOption={(area) => `Use "${area}"`}
                                hasError={Boolean(areaError)}
                                required
                            />
                            {areaError ? (
                                <p className="mt-1 text-xs font-medium text-red-600">{areaError}</p>
                            ) : null}
                        </div>
                    ) : !isUaeCountry(address.country) ? (
                        <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Area/District</label>
                            <input 
                                name="district" 
                                onChange={handleAddressChange} 
                                value={address.district} 
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#f59e0b] focus:bg-white focus:ring-4 focus:ring-[#fde7c2]" 
                                type="text" 
                                placeholder="Area or district" 
                                required 
                            />
                        </div>
                    ) : null}

                    <div>
                        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Country</label>
                        <SearchableSelect
                            value={address.country}
                            onChange={(value) => {
                                const selectedCountry = countries.find((country) => country.name === value);
                                setAddress({
                                    ...address,
                                    country: value,
                                    state: '',
                                    district: '',
                                    zip: '',
                                    phoneCode: selectedCountry?.code || '+971',
                                });
                                setPincodeError('');
                            }}
                            options={countries.map((country) => country.name)}
                            placeholder="Select Country"
                            searchPlaceholder="Search country..."
                            emptyMessage="No countries found"
                            required
                        />
                    </div>
                    </div>

                    <div className="mt-2 flex gap-3">
                        <button 
                            type="submit"
                            className="flex-1 rounded-2xl bg-[#E52721] py-3.5 font-semibold text-white shadow-[0_12px_28px_rgba(229,39,33,0.28)] transition hover:bg-[#C41F1A]"
                        >
                            {isEdit || editingAddress ? 'Save changes' : 'Save address'}
                        </button>
                        <button 
                            type="button"
                            onClick={() => {
                                if (mode === 'form' && addressList.length > 0 && !isEdit) {
                                    setEditingAddress(null);
                                    setMode('select');
                                } else {
                                    setShowAddressModal(false);
                                }
                            }}
                            className="flex-1 rounded-2xl border border-slate-200 bg-white py-3.5 font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                            {mode === 'form' && addressList.length > 0 && !isEdit ? 'Back' : 'Cancel'}
                        </button>
                    </div>
                    </div>
                </form>
                    )}
                </div>
            </div>
        </div>
    )
}

export default AddressModal