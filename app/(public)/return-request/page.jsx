'use client'
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import axios from 'axios';
import toast from 'react-hot-toast';
import { Upload, X, RefreshCw, Undo2, StarIcon } from 'lucide-react';
import Loading from '@/components/Loading';
import PageTitle from '@/components/PageTitle';
import { useAuth } from '@/lib/useAuth';
import { getOrderLineItemDisplayName, getOrderLineProduct } from '@/lib/orderDisplay';


function ReturnRequestForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const orderId = searchParams.get('orderId');
    const { user, loading: authLoading, getToken } = useAuth();
    const isLoaded = !authLoading;
    const isSignedIn = Boolean(user);

    const [loading, setLoading] = useState(true);
    const [order, setOrder] = useState(null);
    const [formData, setFormData] = useState({
        type: 'RETURN',
        reason: '',
        description: '',
        images: [],
        imageFiles: [],
        videos: [],
        videoFiles: [],
        fastProcess: false,
        productRating: 0,
        deliveryRating: 0,
        reviewText: '',
        items: [],
        refundMethod: 'ORIGINAL',
        pickupAddress: {
            name: '',
            phone: '',
            email: '',
            street: '',
            city: '',
            state: '',
            zip: '',
            country: 'United Arab Emirates',
            instructions: '',
        },
    });
    const [uploading, setUploading] = useState(false);
    const [daysSinceDelivery, setDaysSinceDelivery] = useState(null);
    const [submitted, setSubmitted] = useState(null);
    const [infoRequest, setInfoRequest] = useState(null);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            router.push('/sign-in');
            return;
        }
        if (!orderId) {
            toast.error('Order ID is required');
            router.push('/orders');
            return;
        }
        fetchOrder();
    }, [isLoaded, isSignedIn, orderId]);

    const fetchOrder = async () => {
        try {
            const token = await getToken();
            if (!token) {
                router.push('/sign-in');
                return;
            }
            const { data } = await axios.get(`/api/orders?orderId=${encodeURIComponent(orderId)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const foundOrder = data.order;
            if (!foundOrder) {
                toast.error('Order not found');
                router.push('/orders');
                return;
            }
            if (foundOrder.status !== 'DELIVERED') {
                toast.error('Only delivered orders can be returned/replaced');
                router.push('/orders');
                return;
            }

            const deliveredDate = foundOrder.orderDelivered || foundOrder.whatsappSentAt?.orderDelivered || foundOrder.updatedAt
                ? new Date(foundOrder.orderDelivered || foundOrder.whatsappSentAt?.orderDelivered || foundOrder.updatedAt)
                : null;
            const dsd = deliveredDate ? Math.floor((new Date() - deliveredDate) / (1000 * 60 * 60 * 24)) : 999;
            setDaysSinceDelivery(dsd);

            const shipping = foundOrder.shippingAddress || foundOrder.addressId || {};
            const items = (foundOrder.orderItems || []).map((item, index) => ({
                itemIndex: index,
                selected: index === 0,
                quantity: 1,
                max: Number(item.quantity || 1),
            }));

            setFormData((prev) => ({
                ...prev,
                items,
                pickupAddress: {
                    name: shipping.name || foundOrder.guestName || '',
                    phone: shipping.phone || foundOrder.guestPhone || '',
                    email: shipping.email || foundOrder.guestEmail || '',
                    street: shipping.street || '',
                    city: shipping.city || '',
                    state: shipping.state || '',
                    zip: shipping.zip || '',
                    country: shipping.country || 'United Arab Emirates',
                    instructions: '',
                },
            }));
            setOrder(foundOrder);
            const existing = (foundOrder.returnRequests || []).find((row) => row.status === 'INFO_REQUIRED');
            if (existing) setInfoRequest(existing);
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to fetch order');
            router.push('/orders');
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length + formData.images.length > 5) {
            toast.error('Maximum 5 images allowed');
            return;
        }

        setUploading(true);
        try {
            // For preview only; actual upload will happen on submit via form-data
            const previews = files.map((file) => URL.createObjectURL(file));
            setFormData(prev => ({
                ...prev,
                images: [...prev.images, ...previews],
                imageFiles: [...prev.imageFiles, ...files]
            }));
        } catch (error) {
            toast.error('Failed to upload images');
        } finally {
            setUploading(false);
        }
    };

    const handleVideoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 50 * 1024 * 1024) { // 50MB limit
            toast.error('Video size must be less than 50MB');
            return;
        }

        setUploading(true);
        try {
            // For preview; upload on submit
            const videoUrl = URL.createObjectURL(file);
            setFormData(prev => ({
                ...prev,
                videos: [...prev.videos, videoUrl],
                videoFiles: [...prev.videoFiles, file]
            }));
        } catch (error) {
            toast.error('Failed to upload video');
        } finally {
            setUploading(false);
        }
    };

    const removeImage = (index) => {
        setFormData(prev => ({
            ...prev,
            images: prev.images.filter((_, i) => i !== index),
            imageFiles: prev.imageFiles.filter((_, i) => i !== index)
        }));
    };

    const removeVideo = (index) => {
        setFormData(prev => ({
            ...prev,
            videos: prev.videos.filter((_, i) => i !== index),
            videoFiles: prev.videoFiles.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.reason) {
            toast.error('Please select a reason');
            return;
        }

        const selectedItems = formData.items.filter((item) => item.selected);
        if (!selectedItems.length) {
            toast.error('Select at least one product');
            return;
        }

        try {
            const token = await getToken();
            const fd = new FormData();
            fd.append('orderId', orderId);
            fd.append('type', formData.type);
            fd.append('reason', formData.reason);
            fd.append('description', formData.description || '');
            fd.append('fastProcess', String(!!formData.fastProcess));
            fd.append('refundMethod', formData.refundMethod);
            fd.append('pickupAddress', JSON.stringify(formData.pickupAddress));
            fd.append('items', JSON.stringify(selectedItems.map((item) => ({
                itemIndex: item.itemIndex,
                quantity: item.quantity,
            }))));
            if (formData.productRating) fd.append('productRating', String(formData.productRating));
            if (formData.deliveryRating) fd.append('deliveryRating', String(formData.deliveryRating));
            if (formData.reviewText) fd.append('reviewText', formData.reviewText);
            formData.imageFiles.forEach((file) => fd.append('images', file));
            formData.videoFiles.forEach((file) => fd.append('videos', file));

            const { data } = await axios.post('/api/return-request', fd, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setSubmitted(data.request);
            if (data.eligible === false) {
                toast.error(data.eligibility?.reason || data.message || 'Request is not eligible');
            } else {
                toast.success(`Request ${data.request?.returnNumber} submitted`);
            }
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to submit request');
        }
    };

    if (!isLoaded || loading) return <Loading />;

    if (submitted) {
        return (
            <div className="bg-gray-50 py-8 px-4">
                <div className="max-w-3xl mx-auto min-h-[60vh]">
                    <PageTitle heading="Return / Replace" text="Your request has been recorded" path="/orders" linkText="Back to Orders" />
                    <div className="bg-white rounded-xl shadow-lg p-6 mt-6 space-y-3">
                        <p className="text-lg font-semibold text-gray-900">{submitted.returnNumber}</p>
                        <p className="text-gray-700">{submitted.statusLabel}</p>
                        {submitted.eligibilityReason ? (
                            <p className="text-red-700">{submitted.eligibilityReason}</p>
                        ) : (
                            <p className="text-gray-600">We will notify you as the request is reviewed and pickup is scheduled.</p>
                        )}
                        <button
                            type="button"
                            onClick={() => router.push('/orders')}
                            className="mt-4 bg-orange-500 text-white py-3 px-6 rounded-lg hover:bg-orange-600"
                        >
                            Back to My Orders
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (infoRequest) {
        const handleExtra = async (e) => {
            e.preventDefault();
            try {
                const token = await getToken();
                const fd = new FormData();
                fd.append('id', infoRequest.id);
                fd.append('description', formData.description || '');
                formData.imageFiles.forEach((file) => fd.append('images', file));
                formData.videoFiles.forEach((file) => fd.append('videos', file));
                const { data } = await axios.patch('/api/return-request', fd, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                toast.success(data.message || 'Additional information sent');
                setSubmitted(data.request);
                setInfoRequest(null);
            } catch (error) {
                toast.error(error?.response?.data?.error || 'Failed to upload');
            }
        };
        return (
            <div className="bg-gray-50 py-8 px-4">
                <div className="max-w-3xl mx-auto min-h-[60vh]">
                    <PageTitle heading="Return / Replace" text={`${infoRequest.returnNumber} needs more information`} path="/orders" linkText="Back to Orders" />
                    <div className="bg-white rounded-xl shadow-lg p-6 mt-6 space-y-4">
                        <p className="text-gray-700">{infoRequest.infoRequestedMessage}</p>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows="4"
                            className="w-full px-4 py-3 border rounded-lg"
                            placeholder="Add more details..."
                        />
                        <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer">
                            <Upload size={20} />
                            <span>Upload additional photos</span>
                            <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                        </label>
                        <button type="button" onClick={handleExtra} className="w-full bg-orange-500 text-white py-3 rounded-lg">
                            Submit additional information
                        </button>
                    </div>
                </div>
            </div>
        );
    }
    const returnEligible = order?.orderItems?.filter((item) => getOrderLineProduct(item).allowReturn !== false) || [];
    const replacementEligible = order?.orderItems?.filter((item) => getOrderLineProduct(item).allowReplacement !== false) || [];

    return (
        <div className="bg-gray-50 py-8 px-4">
            <div className="max-w-3xl mx-auto min-h-[60vh]">
                <PageTitle 
                    heading="Return / Replace"
                    text="Request returns within 3 days of delivery for eligible damaged or incomplete orders (see Return Policy)"
                    linkText="Back to Orders"
                />

                {/* Product Eligibility Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-6">
                    <h3 className="font-semibold text-blue-900 mb-2">Product Eligibility</h3>
                    <div className="text-sm text-blue-800 space-y-1">
                        <p>✓ <strong>{returnEligible.length}</strong> product(s) eligible for return</p>
                        <p>✓ <strong>{replacementEligible.length}</strong> product(s) eligible for replacement</p>
                        {returnEligible.length === 0 && replacementEligible.length === 0 && (
                            <p className="text-red-600 font-medium mt-2">⚠ No products in this order are eligible for return or replacement.</p>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
                    {/* Request Type */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Request Type *
                        </label>
                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() => returnEligible.length > 0 && daysSinceDelivery <= 7 && setFormData({...formData, type: 'RETURN'})}
                                disabled={returnEligible.length === 0 || (daysSinceDelivery !== null && daysSinceDelivery > 7)}
                                className={`flex-1 py-3 px-4 rounded-lg border-2 transition flex items-center justify-center gap-2 ${
                                    formData.type === 'RETURN'
                                        ? 'border-red-500 bg-red-50 text-red-700'
                                        : (returnEligible.length === 0 || (daysSinceDelivery !== null && daysSinceDelivery > 7))
                                        ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'border-gray-300 hover:border-gray-400'
                                }`}
                            >
                                <Undo2 size={20} />
                                Return Product
                                {(returnEligible.length === 0 || (daysSinceDelivery !== null && daysSinceDelivery > 7)) && <span className="text-xs">(Not Available)</span>}
                            </button>
                            <button
                                type="button"
                                onClick={() => replacementEligible.length > 0 && setFormData({...formData, type: 'REPLACEMENT'})}
                                disabled={replacementEligible.length === 0}
                                className={`flex-1 py-3 px-4 rounded-lg border-2 transition flex items-center justify-center gap-2 ${
                                    formData.type === 'REPLACEMENT'
                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                        : replacementEligible.length === 0
                                        ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'border-gray-300 hover:border-gray-400'
                                }`}
                            >
                                <RefreshCw size={20} />
                                Replace Product
                                {replacementEligible.length === 0 && <span className="text-xs">(Not Available)</span>}
                            </button>
                        </div>
                        {daysSinceDelivery !== null && daysSinceDelivery > 7 && daysSinceDelivery <= 15 && (
                            <p className="mt-2 text-sm text-blue-600">Return period is over. You can still request a replacement within 15 days of delivery.</p>
                        )}
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-3">Product *</label>
                        <div className="space-y-3">
                            {(order?.orderItems || []).map((item, index) => {
                                const selected = formData.items.find((row) => row.itemIndex === index);
                                const product = getOrderLineProduct(item);
                                return (
                                    <label key={index} className="flex items-start gap-3 border border-gray-200 rounded-lg p-3">
                                        <input
                                            type="checkbox"
                                            className="mt-1"
                                            checked={Boolean(selected?.selected)}
                                            onChange={(e) => setFormData((prev) => ({
                                                ...prev,
                                                items: prev.items.map((row) => row.itemIndex === index
                                                    ? { ...row, selected: e.target.checked }
                                                    : row),
                                            }))}
                                        />
                                        <div className="flex-1">
                                            <p className="font-medium text-gray-900">{getOrderLineItemDisplayName(item, product)}</p>
                                            <p className="text-xs text-gray-500">SKU {product.sku || '—'} · Ordered {item.quantity}</p>
                                            {selected?.selected && (
                                                <div className="mt-2 flex items-center gap-2">
                                                    <span className="text-sm text-gray-600">Quantity</span>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max={selected.max || item.quantity || 1}
                                                        value={selected.quantity}
                                                        onChange={(e) => setFormData((prev) => ({
                                                            ...prev,
                                                            items: prev.items.map((row) => row.itemIndex === index
                                                                ? { ...row, quantity: Math.max(1, Number(e.target.value || 1)) }
                                                                : row),
                                                        }))}
                                                        className="w-20 px-2 py-1 border border-gray-300 rounded"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    {/* Reason */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Reason *
                        </label>
                        <select
                            value={formData.reason}
                            onChange={(e) => setFormData({...formData, reason: e.target.value})}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            required
                        >
                            <option value="">Select a reason</option>
                            <option value="Defective Product">Defective Product</option>
                            <option value="Wrong Item Received">Wrong Item Received</option>
                            <option value="Damaged During Shipping">Damaged During Shipping</option>
                            <option value="Not as Described">Not as Described</option>
                            <option value="Quality Issue">Quality Issue</option>
                            <option value="Size/Fit Issue">Size/Fit Issue</option>
                            <option value="Changed Mind">Changed Mind</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    {/* Description */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Additional Details (Optional)
                        </label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            rows="4"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            placeholder="Please provide more details about your request..."
                        />
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Pickup address *</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {['name', 'phone', 'email', 'street', 'city', 'state', 'zip'].map((field) => (
                                <input
                                    key={field}
                                    value={formData.pickupAddress[field] || ''}
                                    onChange={(e) => setFormData((prev) => ({
                                        ...prev,
                                        pickupAddress: { ...prev.pickupAddress, [field]: e.target.value },
                                    }))}
                                    placeholder={field[0].toUpperCase() + field.slice(1)}
                                    className={`px-4 py-3 border border-gray-300 rounded-lg ${field === 'street' ? 'md:col-span-2' : ''}`}
                                />
                            ))}
                            <textarea
                                value={formData.pickupAddress.instructions || ''}
                                onChange={(e) => setFormData((prev) => ({
                                    ...prev,
                                    pickupAddress: { ...prev.pickupAddress, instructions: e.target.value },
                                }))}
                                rows="2"
                                placeholder="Pickup instructions"
                                className="md:col-span-2 px-4 py-3 border border-gray-300 rounded-lg"
                            />
                        </div>
                    </div>

                    {formData.type === 'RETURN' && (
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Refund method *</label>
                            <select
                                value={formData.refundMethod}
                                onChange={(e) => setFormData({ ...formData, refundMethod: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                            >
                                <option value="ORIGINAL">Original payment method</option>
                                <option value="WALLET">Wallet</option>
                            </select>
                        </div>
                    )}

                    {/* Images Upload */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Upload Images (Optional, Max 5)
                        </label>
                        <div className="flex flex-wrap gap-4 mb-4">
                            {formData.images.map((img, index) => (
                                <div key={index} className="relative">
                                    <img src={img} alt={`Upload ${index + 1}`} className="w-24 h-24 object-cover rounded-lg" />
                                    <button
                                        type="button"
                                        onClick={() => removeImage(index)}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        {formData.images.length < 5 && (
                            <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-orange-500 transition">
                                <Upload size={20} />
                                <span>Upload Images</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleImageUpload}
                                    className="hidden"
                                    disabled={uploading}
                                />
                            </label>
                        )}
                    </div>

                    {/* Video Upload */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Upload Video (Optional, Max 50MB)
                        </label>
                        {formData.videos.length > 0 && (
                            <div className="mb-4">
                                {formData.videos.map((video, index) => (
                                    <div key={index} className="relative inline-block">
                                        <video src={video} className="w-48 h-48 object-cover rounded-lg" controls />
                                        <button
                                            type="button"
                                            onClick={() => removeVideo(index)}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {formData.videos.length === 0 && (
                            <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-orange-500 transition">
                                <Upload size={20} />
                                <span>Upload Video</span>
                                <input
                                    type="file"
                                    accept="video/*"
                                    onChange={handleVideoUpload}
                                    className="hidden"
                                    disabled={uploading}
                                />
                            </label>
                        )}
                    </div>

                    {/* Review and Ratings */}
                    <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Product Rating (optional)</label>
                            <div className="flex gap-1">
                                {[1,2,3,4,5].map(star => (
                                    <button
                                        key={`pr-${star}`}
                                        type="button"
                                        onClick={() => setFormData(prev => ({...prev, productRating: star}))}
                                        className="transition hover:scale-110"
                                        aria-label={`Rate ${star} star`}
                                    >
                                        <StarIcon
                                            size={28}
                                            fill={formData.productRating >= star ? "#FFA500" : "#D1D5DB"}
                                            className="text-transparent"
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Rating (optional)</label>
                            <div className="flex gap-1">
                                {[1,2,3,4,5].map(star => (
                                    <button
                                        key={`dr-${star}`}
                                        type="button"
                                        onClick={() => setFormData(prev => ({...prev, deliveryRating: star}))}
                                        className="transition hover:scale-110"
                                        aria-label={`Rate delivery ${star} star`}
                                    >
                                        <StarIcon
                                            size={28}
                                            fill={formData.deliveryRating >= star ? "#FFA500" : "#D1D5DB"}
                                            className="text-transparent"
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Your feedback (optional)</label>
                            <textarea
                                value={formData.reviewText}
                                onChange={(e) => setFormData(prev => ({...prev, reviewText: e.target.value}))}
                                rows="4"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                placeholder="Share your thoughts about the product or delivery..."
                            />
                        </div>
                    </div>

                    {/* Fast Process Option */}
                    <div className="mb-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.fastProcess}
                                onChange={(e) => setFormData({...formData, fastProcess: e.target.checked})}
                                className="w-5 h-5 text-orange-500 rounded focus:ring-orange-500"
                            />
                            <span className="text-sm font-medium text-gray-700">
                                Request Fast Processing (Priority handling)
                            </span>
                        </label>
                    </div>

                    {/* Submit Button */}
                    <button
                        onClick={handleSubmit}
                        disabled={uploading || !formData.reason}
                        className="w-full bg-orange-500 text-white py-3 px-6 rounded-lg hover:bg-orange-600 transition disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                    >
                        {uploading ? 'Uploading...' : 'Submit Request'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ReturnRequestPage() {
    return (
        <Suspense fallback={<Loading />}>
            <ReturnRequestForm />
        </Suspense>
    );
}
