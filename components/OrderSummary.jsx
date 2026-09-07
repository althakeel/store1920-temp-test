
import { PlusIcon, SquarePenIcon, XIcon } from 'lucide-react';
import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic';
import Script from 'next/script';
import AddressModal from './AddressModal';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { clearCart, fetchCart } from '@/lib/features/cart/cartSlice';

import { addAddress } from '@/lib/features/address/addressSlice';
import countryList from 'react-select-country-list';
import { countryCodes } from '@/assets/countryCodes';
import { STORE1920_LOGO_PATH } from '@/lib/brandLogo';
import { useAuth } from '@/lib/useAuth';
import { useStorefrontMarket } from '@/lib/useStorefrontMarket';
const PrepaidUpsellModal = dynamic(() => import('@/components/PrepaidUpsellModal'), { ssr: false });


const OrderSummary = ({ totalPrice, items }) => {
    const { user, loading: authLoading, getToken } = useAuth();
    const { market, formatAmount } = useStorefrontMarket();
    const isSignedIn = !!user;
    const dispatch = useDispatch();
    const currency = market.currency;
    const router = useRouter();
    const addressList = useSelector(state => state.address.list);
    const addressFetchError = useSelector(state => state.address.error);
    const [addressError, setAddressError] = useState("");

    const [paymentMethod, setPaymentMethod] = useState('COD');
    const [selectedAddress, setSelectedAddress] = useState(null);
    const [showAddressModal, setShowAddressModal] = useState(false);
    const [couponCodeInput, setCouponCodeInput] = useState('');
    const [coupon, setCoupon] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPrepaidModal, setShowPrepaidModal] = useState(false);
    const [upsellOrderId, setUpsellOrderId] = useState(null);
    const [payingNow, setPayingNow] = useState(false);
    const [navigatingToSuccess, setNavigatingToSuccess] = useState(false);
    // Guest checkout fields
    const [isGuestCheckout, setIsGuestCheckout] = useState(!isSignedIn);
    const [guestInfo, setGuestInfo] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        pincode: '',
        country: 'United Arab Emirates'
    });

    // Shipping settings (defaults mirror prior behavior)
    const [shipping, setShipping] = useState({
        enabled: true,
        shippingType: 'FLAT_RATE',
        flatRate: 5,
        perItemFee: 2,
        maxItemFee: null,
        freeShippingMin: 499,
        weightUnit: 'kg',
        baseWeight: 1,
        baseWeightFee: 5,
        additionalWeightFee: 2,
        enableCard: true,
        maxCardAmount: 0,
    });

    // Check if user is eligible for welcome bonus free shipping
    const [hasFreeShippingBonus, setHasFreeShippingBonus] = useState(false);

    useEffect(() => {
        // Check if user claimed welcome bonus and is logged in
        if (user) {
            const freeShippingEligible = localStorage.getItem('freeShippingEligible');
            if (freeShippingEligible === 'true') {
                setHasFreeShippingBonus(true);
            }
        }
    }, [user]);

    // Auto-select first address when addresses are loaded
    useEffect(() => {
        if (isSignedIn && addressList.length > 0 && !selectedAddress) {
            setSelectedAddress(addressList[0]);
        }
        if (isSignedIn && addressFetchError) {
            setAddressError(addressFetchError);
        } else if (isSignedIn && addressList.length === 0) {
            setAddressError("No addresses found. Please add a new address.");
        } else {
            setAddressError("");
        }
    }, [addressList, isSignedIn, selectedAddress, addressFetchError]);

    // Auto-select guest checkout if not signed in
    useEffect(() => {
        if (!isSignedIn) {
            setIsGuestCheckout(true);
        }
    }, [isSignedIn]);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const { data } = await axios.get('/api/shipping');
                if (data?.setting) {
                    setShipping({
                        enabled: Boolean(data.setting.enabled),
                        shippingType: data.setting.shippingType || 'FLAT_RATE',
                        flatRate: Number(data.setting.flatRate ?? 5),
                        perItemFee: Number(data.setting.perItemFee ?? 2),
                        maxItemFee: data.setting.maxItemFee ? Number(data.setting.maxItemFee) : null,
                        freeShippingMin: Number(data.setting.freeShippingMin ?? 499),
                        weightUnit: data.setting.weightUnit || 'kg',
                        baseWeight: Number(data.setting.baseWeight ?? 1),
                        baseWeightFee: Number(data.setting.baseWeightFee ?? 5),
                        additionalWeightFee: Number(data.setting.additionalWeightFee ?? 2),
                        enableCard: data.setting.enableCard !== false,
                        maxCardAmount: Number(data.setting.maxCardAmount || 0),
                    });
                }
            } catch (err) {
                // Silent fallback to defaults
            }
        };
        fetchSettings();
    }, []);

    // Calculate shipping fee
    const calculateShipping = () => {
        // If user has welcome bonus, give free shipping
        if (hasFreeShippingBonus) {
            return 0;
        }
        
        // Otherwise, site-wide free shipping
        return 0;
    };

    const shippingFee = calculateShipping();
    const canOfferCardPay = (amount) => {
        if (shipping.enableCard === false) return false;
        const maxCard = Number(shipping.maxCardAmount || 0);
        return !(maxCard > 0 && Number(amount || 0) > maxCard);
    };

    const handleCouponCode = async (event) => {
        event.preventDefault();
        try {
            const storeId = items[0]?.storeId;
            const productIds = items.map(item => item.id);
            
            const { data } = await axios.post('/api/coupons', {
                code: couponCodeInput,
                storeId: storeId,
                orderTotal: totalPrice,
                userId: user?.uid || undefined,
                cartProductIds: productIds
            })
            
            if (data.valid && data.coupon) {
                setCoupon(data.coupon)
                toast.success('Coupon Applied')
            } else {
                toast.error(data.error || 'Invalid coupon code')
            }
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
        
    }

    const handlePlaceOrder = async (e) => {
        e.preventDefault();
        if (loading) return;
        setLoading(true);
        try {
            // Guest checkout validation
            if (!isSignedIn && isGuestCheckout) {
                const missingFields = [];
                if (!guestInfo.name) missingFields.push('Name');
                if (!guestInfo.email) missingFields.push('Email');
                if (!guestInfo.phone) missingFields.push('Phone');
                if (!guestInfo.address) missingFields.push('Address');
                if (!guestInfo.city) missingFields.push('City');
                if (!guestInfo.state) missingFields.push('State');
                if (!guestInfo.country) missingFields.push('Country');
                if (missingFields.length > 0) {
                    return toast.error(`Please fill: ${missingFields.join(', ')}`);
                }
                const orderData = {
                    isGuest: true,
                    items,
                    paymentMethod,
                    guestInfo: {
                        ...guestInfo,
                        street: guestInfo.address,
                        city: guestInfo.city || guestInfo.state,
                    }
                };

                try {
                    const { data } = await axios.post('/api/orders', orderData, {
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    // Handle array of orders for guests
                    if (data && ((data.orders && Array.isArray(data.orders) && data.orders.length > 0) || (data.order && data.order.id))) {
                        if (paymentMethod === 'STRIPE') {
                            window.location.href = data.session.url;
                        } else {
                            dispatch(clearCart());
                            toast.success(data.message);
                            const orderId = data.orders ? data.orders[0].id : data.order.id;
                            // If COD and card/Stripe is on, show prepaid upsell before redirect
                            if (paymentMethod === 'COD' && canOfferCardPay(totalPrice)) {
                                setUpsellOrderId(orderId);
                                setShowPrepaidModal(true);
                            } else {
                                router.push(`/order-success?orderId=${orderId}`);
                            }
                        }
                    } else {
                        router.push('/order-failed');
                    }
                } catch (err) {
                    console.error('Guest order error:', err);
                    console.error('Error response:', err?.response?.data);
                    // Silently redirect to order-failed page instead of showing error
                    router.push('/order-failed');
                }
                setLoading(false);
                return;
            }

            // Regular logged-in user checkout
            if(!user){
                return toast.error('Please login to continue')
            }
            // If address is not selected, save the form as a new address and select it
            let addressToUse = selectedAddress;
            if(!selectedAddress){
                // Save new address to user address book
                const token = await getToken();
                const addressPayload = {
                    name: guestInfo.name,
                    email: guestInfo.email,
                    street: guestInfo.address,
                    city: guestInfo.city,
                    state: guestInfo.state,
                    pincode: guestInfo.pincode,
                    country: guestInfo.country,
                    phone: guestInfo.phone
                };
                try {
                    const { data } = await axios.post('/api/address', { address: addressPayload }, { headers: { Authorization: `Bearer ${token}` } });
                    dispatch(addAddress(data.newAddress));
                    addressToUse = data.newAddress;
                    setSelectedAddress(data.newAddress);
                    toast.success('Address saved to your account');
                } catch (err) {
                    console.error('Address save error:', err);
                    // Silently fail - user can still try to place order with existing address
                    setLoading(false);
                    return;
                }
            }
            if(!addressToUse){
                setLoading(false);
                return;
            }
            const token = await getToken();
            const orderData = {
                addressId: addressToUse.id,
                items,
                paymentMethod
            };
            if(coupon){
                orderData.couponCode = coupon.code;
            }
            // create order
            const {data} = await axios.post('/api/orders', orderData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if(data && data.order && data.order.id){
                // Remove welcome bonus eligibility after first order
                if (hasFreeShippingBonus) {
                    localStorage.removeItem('freeShippingEligible');
                    setHasFreeShippingBonus(false);
                }
                
                if(paymentMethod === 'STRIPE'){
                    window.location.href = data.session.url;
                }else{
                    // Clear cart immediately for COD orders
                    dispatch(clearCart());
                    toast.success(data.message || 'Order placed successfully!');
                    const orderId = data.order.id;
                    if (canOfferCardPay(totalPrice)) {
                        setUpsellOrderId(orderId);
                        setShowPrepaidModal(true);
                    } else {
                        setNavigatingToSuccess(true);
                        router.push(`/order-success?orderId=${orderId}`);
                    }
                    // Fetch updated cart from server to sync
                    dispatch(fetchCart({getToken}));
                }
            }else{
                setLoading(false);
                router.push('/order-failed');
            }
        } catch (error) {
            console.error('Order placement error:', error);
            setLoading(false);
            // Silently redirect to order-failed page instead of showing errors
            router.push('/order-failed');
        } finally {
            setLoading(false);
        }

        
    }

    const handlePayNowForExistingOrder = async () => {
        if (!upsellOrderId) return;
        try {
            setPayingNow(true);
            const orderRes = await fetch(`/api/orders?orderId=${upsellOrderId}`);
            const orderData = await orderRes.json();
            const order = orderData.order;
            if (!order) {
                setPayingNow(false);
                setShowPrepaidModal(false);
                router.push(`/order-success?orderId=${upsellOrderId}`);
                return;
            }
            const discountedAmount = Math.round((order.total || 0) * 0.95);

            const rpRes = await fetch('/api/razorpay/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: discountedAmount, currency: 'AED', receipt: `order_${upsellOrderId}` })
            });
            const rpData = await rpRes.json();
            if (!rpRes.ok || !rpData.success || !rpData.orderId) {
                setPayingNow(false);
                setShowPrepaidModal(false);
                router.push(`/order-success?orderId=${upsellOrderId}`);
                return;
            }

            const options = {
                key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
                order_id: rpData.orderId,
                amount: Math.round(discountedAmount * 100),
                currency: 'AED',
                name: 'Store1920',
                description: 'Prepaid Payment (5% OFF)',
                image: STORE1920_LOGO_PATH,
                handler: async function (response) {
                    try {
                        const verifyRes = await fetch('/api/razorpay/verify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_signature: response.razorpay_signature,
                                paymentPayload: { existingOrderId: upsellOrderId }
                            })
                        });
                        setPayingNow(false);
                        setShowPrepaidModal(false);
                        router.push(`/order-success?orderId=${upsellOrderId}`);
                    } catch (err) {
                        setPayingNow(false);
                        setShowPrepaidModal(false);
                        router.push(`/order-success?orderId=${upsellOrderId}`);
                    }
                },
                theme: { color: '#16a34a' },
                modal: {
                    ondismiss: function () {
                        setPayingNow(false);
                        setShowPrepaidModal(false);
                        router.push(`/order-success?orderId=${upsellOrderId}`);
                    }
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.open();
        } catch (err) {
            setPayingNow(false);
            setShowPrepaidModal(false);
            router.push(`/order-success?orderId=${upsellOrderId}`);
        }
    };

    const allCountries = countryList().getData();

    return (
        <div className='w-full bg-white rounded-lg shadow-sm border border-gray-200 p-5'>
            <h2 className='text-lg font-bold text-gray-900 mb-4 uppercase'>Order Summary</h2>
            
            {/* Show shipping address section only for logged-in users */}
            {isSignedIn && (
                <div className='my-4 pb-4 border-b border-slate-200'>
                    <p className='text-slate-600 font-medium mb-3'>Shipping Address</p>
                    {addressError && (
                        <div className='text-red-600 text-sm mb-2'>{addressError}</div>
                    )}
                    {addressList.length > 0 && (
                        <select
                            className='border border-slate-300 p-2.5 w-full rounded-lg outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm mb-2'
                            value={selectedAddress ? selectedAddress.id : ''}
                            onChange={e => {
                                const addr = addressList.find(a => a.id === e.target.value);
                                setSelectedAddress(addr);
                            }}
                        >
                            <option value='' disabled>Select Address</option>
                            {addressList.map(addr => (
                                <option key={addr.id} value={addr.id}>
                                    {addr.street}, {addr.city}, {addr.state}, {addr.zip}, {addr.country}
                                </option>
                            ))}
                        </select>
                    )}
                    <button
                        type='button'
                        className='text-orange-600 font-medium underline text-sm mb-2'
                        onClick={() => setShowAddressModal(true)}
                    >
                        + Add New Address
                    </button>
                </div>
            )}

            {/* Show quick checkout form only for guests (not logged in) */}
            {!isSignedIn && (
                <div className='my-4 pb-4 border-b border-slate-200'>
                    <div className='flex items-center mb-3'>
                        <input
                            type='checkbox'
                            id='guestCheckout'
                            checked={isGuestCheckout}
                            onChange={e => setIsGuestCheckout(e.target.checked)}
                            className='accent-orange-500 mr-2'
                        />
                        <label htmlFor='guestCheckout' className='cursor-pointer text-slate-700 font-semibold text-base'>Continue as Guest</label>
                        <button
                            type='button'
                            className='ml-auto text-blue-600 hover:text-blue-700 underline text-sm font-medium'
                            onClick={() => router.push('/sign-in')}
                        >
                            Sign In Instead
                        </button>
                    </div>
                    {!isGuestCheckout && (
                        <p className='text-sm text-slate-600 italic'>Check the box above to checkout without creating an account</p>
                    )}
                    {isGuestCheckout && (
                        <div className='space-y-2.5'>
                            <input
                                type="text"
                                placeholder="Full Name *"
                                value={guestInfo.name}
                                onChange={e => setGuestInfo({...guestInfo, name: e.target.value})}
                                className='border border-slate-300 p-2.5 w-full rounded-lg outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm'
                            />
                            <div>
                            <input
                                type="email"
                                placeholder="Email Address *"
                                value={guestInfo.email}
                                onChange={e => setGuestInfo({...guestInfo, email: e.target.value})}
                                className='border border-slate-300 p-2.5 w-full rounded-lg outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm'
                            />
                            <p className="text-xs text-gray-400 mt-1">📧 Sign in later with this email or phone to see this order in your account history.</p>
                            </div>
                            <input
                                type="tel"
                                placeholder="Phone Number *"
                                value={guestInfo.phone}
                                onChange={e => {
                                    const value = e.target.value.replace(/\D/g, '').slice(0, 15);
                                    setGuestInfo({...guestInfo, phone: value});
                                }}
                                maxLength="15"
                                pattern="[0-9]{7,15}"
                                title="Phone number must be 7-15 digits"
                                className='border border-slate-300 p-2.5 w-full rounded-lg outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm'
                            />
                            <textarea
                                placeholder="Address *"
                                value={guestInfo.address}
                                onChange={e => setGuestInfo({...guestInfo, address: e.target.value})}
                                rows="2"
                                className='border border-slate-300 p-2.5 w-full rounded-lg outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm resize-none'
                            />
                            <input
                                type="text"
                                placeholder="City *"
                                value={guestInfo.city}
                                onChange={e => setGuestInfo({ ...guestInfo, city: e.target.value })}
                                className='border border-slate-300 p-2.5 w-full rounded-lg outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm'
                            />
                            <input
                                type="text"
                                placeholder="State / Emirate *"
                                value={guestInfo.state}
                                onChange={e => setGuestInfo({ ...guestInfo, state: e.target.value })}
                                className='border border-slate-300 p-2.5 w-full rounded-lg outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm'
                            />
                            <input
                                type="text"
                                placeholder="Country"
                                value={guestInfo.country}
                                readOnly
                                className='border border-slate-300 p-2.5 w-full rounded-lg outline-none bg-gray-100 text-sm'
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Address selection or form for signed-in users */}
            {isSignedIn && (
                addressList.length === 0 ? (
                    <div className='mb-4'>
                        <div className='space-y-2.5'>
                            <input
                                type="text"
                                placeholder="Full Name *"
                                value={guestInfo.name}
                                onChange={e => setGuestInfo({...guestInfo, name: e.target.value})}
                                className='border border-slate-300 p-2.5 w-full rounded-lg outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm'
                            />
                            <div>
                            <input
                                type="email"
                                placeholder="Email Address *"
                                value={guestInfo.email}
                                onChange={e => setGuestInfo({...guestInfo, email: e.target.value})}
                                className='border border-slate-300 p-2.5 w-full rounded-lg outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm'
                            />
                            <p className="text-xs text-gray-400 mt-1">📧 Sign in later with this email or phone to see this order in your account history.</p>
                            </div>
                            <input
                                type="tel"
                                placeholder="Phone Number *"
                                value={guestInfo.phone}
                                onChange={e => {
                                    const value = e.target.value.replace(/\D/g, '').slice(0, 15);
                                    setGuestInfo({...guestInfo, phone: value});
                                }}
                                maxLength="15"
                                pattern="[0-9]{7,15}"
                                title="Phone number must be 7-15 digits"
                                className='border border-slate-300 p-2.5 w-full rounded-lg outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm'
                            />
                            <textarea
                                placeholder="Address *"
                                value={guestInfo.address}
                                onChange={e => setGuestInfo({...guestInfo, address: e.target.value})}
                                rows="2"
                                className='border border-slate-300 p-2.5 w-full rounded-lg outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm resize-none'
                            />
                            <input
                                type="text"
                                placeholder="City *"
                                value={guestInfo.city}
                                onChange={e => setGuestInfo({ ...guestInfo, city: e.target.value })}
                                className='border border-slate-300 p-2.5 w-full rounded-lg outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm'
                            />
                            <input
                                type="text"
                                placeholder="State / Emirate *"
                                value={guestInfo.state}
                                onChange={e => setGuestInfo({ ...guestInfo, state: e.target.value })}
                                className='border border-slate-300 p-2.5 w-full rounded-lg outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm'
                            />
                            <input
                                type="text"
                                placeholder="Country"
                                value={guestInfo.country}
                                readOnly
                                className='border border-slate-300 p-2.5 w-full rounded-lg outline-none bg-gray-100 text-sm'
                            />
                        </div>
                    </div>
                ) : (
                    <div className='mb-4'>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>Select Address</label>
                        <select
                            value={selectedAddress ? addressList.findIndex(a => a.id === selectedAddress.id) : ''}
                            onChange={e => setSelectedAddress(addressList[e.target.value])}
                            className='border border-slate-300 p-2.5 w-full rounded-lg outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm mb-2'
                        >
                            <option value=''>Select Address</option>
                            {addressList.map((address, idx) => (
                                <option key={address.id} value={idx}>
                                    {address.name}, {address.street || address.address}, {address.district || address.city}, {address.state}
                                </option>
                            ))}
                        </select>
                        <div className='flex gap-2'>
                            <button type='button' className='text-orange-600 hover:underline text-xs' onClick={() => setShowAddressModal(true)}>Edit Selected</button>
                            <button type='button' className='text-orange-600 hover:underline text-xs' onClick={() => setSelectedAddress(null)}>Add Another Address</button>
                        </div>
                    </div>
                )
            )}

            <div className='border-t border-gray-200 pt-4'>
                <p className='text-xs font-semibold text-gray-700 uppercase mb-3'>Payment Method</p>
                <div className='bg-gray-50 border border-gray-200 rounded-lg p-3'>
                    <div className='flex gap-3 items-center'>
                        <input type="radio" id="COD" onChange={() => setPaymentMethod('COD')} checked={paymentMethod === 'COD'} className='accent-orange-500 w-4 h-4' />
                        <label htmlFor="COD" className='cursor-pointer font-medium text-gray-900'>Cash on Delivery</label>
                    </div>
                </div>
            </div>
            
            {/* Address section - only for logged-in users */}
            {isSignedIn && (
            <div className='my-4 pt-4 border-t border-gray-200'>
                <p className='text-xs font-semibold text-gray-700 uppercase mb-3'>Shipping Address</p>
                {
                    selectedAddress ? (
                        <div className='bg-green-50 border border-green-200 rounded-lg p-3'>
                            <div className='flex items-start justify-between gap-2'>
                                <div className='flex-1'>
                                    <p className='font-semibold text-gray-900 text-sm'>{selectedAddress.name}</p>
                                    <p className='text-xs text-gray-600 mt-1'>{selectedAddress.city}, {selectedAddress.state} {selectedAddress.zip}</p>
                                </div>
                                <button onClick={() => setSelectedAddress(null)} className='text-orange-600 hover:text-orange-700'>
                                    <SquarePenIcon size={16} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            {
                                addressList.length > 0 && (
                                    <select className='border border-gray-300 p-2.5 w-full mb-2 outline-none rounded-lg focus:border-orange-500 focus:ring-1 focus:ring-orange-500' onChange={(e) => setSelectedAddress(addressList[e.target.value])} >
                                        <option value="">Select Address</option>
                                        {
                                            addressList.map((address, index) => (
                                                <option key={index} value={index}>{address.name}, {address.city}, {address.state}</option>
                                            ))
                                        }
                                    </select>
                                )
                            }
                            <button className='flex items-center gap-1.5 text-orange-600 hover:text-orange-700 text-sm font-semibold' onClick={() => setShowAddressModal(true)} >
                                <PlusIcon size={16} /> Add New Address
                            </button>
                        </div>
                    )
                }
            </div>
            )}
            <div className='my-4 py-4 border-y border-gray-200'>
                <div className='space-y-3'>
                    <div className='flex justify-between text-sm'>
                        <span className='text-gray-600'>Subtotal</span>
                        <span className='font-semibold text-gray-900'>{currency} {formatAmount(totalPrice)}</span>
                    </div>
                    <div className='flex justify-between text-sm'>
                        <span className='text-gray-600'>Shipping</span>
                        <span className='font-semibold'>
                            <span className='text-green-600'>Free</span>
                            {hasFreeShippingBonus && (
                                <span className='ml-2 text-xs bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 px-2 py-0.5 rounded-full font-bold'>
                                    🎁 Welcome Bonus
                                </span>
                            )}
                        </span>
                    </div>
                    {coupon && (
                        <div className='flex justify-between text-sm'>
                            <span className='text-gray-600'>Coupon ({coupon.discountType === 'percentage' ? `${coupon.discount}%` : `${currency}${formatAmount(coupon.discount)}`})</span>
                            <span className='font-semibold text-green-600'>-{currency}{coupon.discountType === 'percentage' ? formatAmount(coupon.discount / 100 * totalPrice) : formatAmount(Math.min(coupon.discount, totalPrice))}</span>
                        </div>
                    )}
                </div>
                <div className='flex justify-between text-sm font-semibold mt-4'>
                    <span className='text-gray-700'>Total</span>
                    <span className='text-gray-900'>
                        {currency} {formatAmount(
                            Number(totalPrice) + Number(shippingFee)
                            - (coupon ? (coupon.discountType === 'percentage' ? (coupon.discount / 100 * totalPrice) : Math.min(coupon.discount, totalPrice)) : 0)
                        )}
                    </span>
                </div>
            </div>
            
            <button 
                onClick={e => toast.promise(handlePlaceOrder(e), { loading: 'Placing Order...' })}
                disabled={loading || (!isSignedIn && !isGuestCheckout)}
                aria-busy={loading}
                className={`relative w-full py-3.5 rounded-lg font-bold text-base transition-colors shadow-md hover:shadow-lg uppercase ${
                    loading ? 'bg-orange-500 animate-pulse cursor-not-allowed opacity-95 text-white' : (!isSignedIn && !isGuestCheckout 
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                        : 'bg-orange-500 text-white hover:bg-orange-600')
                }`}
            >
                {loading ? (
                    <span className="inline-flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                        </svg>
                        Placing Order...
                    </span>
                ) : (!isSignedIn && !isGuestCheckout ? 'Enable Guest Checkout Above' : 'Place Order')}
                {loading && (
                    <span className="absolute left-0 top-0 h-full w-full overflow-hidden rounded opacity-20">
                        <span className="block h-full w-1/3 bg-white animate-[shimmer_1.2s_ease_infinite]" />
                    </span>
                )}
            </button>

            {showAddressModal && (
                <AddressModal 
                    setShowAddressModal={setShowAddressModal} 
                    getToken={getToken}
                    onAddressAdded={addr => {
                        setSelectedAddress(addr);
                        setAddressError("");
                    }}
                />
            )}

            <PrepaidUpsellModal 
                open={showPrepaidModal}
                onClose={() => { 
                    setNavigatingToSuccess(true); 
                    setShowPrepaidModal(false); 
                    router.push(`/order-success?orderId=${upsellOrderId}`); 
                }}
                onNoThanks={() => { 
                    setNavigatingToSuccess(true); 
                    setShowPrepaidModal(false); 
                    router.push(`/order-success?orderId=${upsellOrderId}`); 
                }}
                onPayNow={handlePayNowForExistingOrder}
                loading={payingNow}
            />

            <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

        </div>
    )
}

export default OrderSummary