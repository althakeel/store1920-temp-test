
'use client'
import PageTitle from "@/components/PageTitle"
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import OrderItem from "@/components/OrderItem";
import axios from "axios";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import Loading from "@/components/Loading";
import { auth, waitForAuthReady } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { GUEST_ORDERS_LINKED_EVENT, linkGuestOrdersForCurrentUser } from '@/lib/linkGuestOrdersClient';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';
import { Headset, PackageSearch, ShoppingBag, Truck } from 'lucide-react';

export default function OrdersClient() {
    const [user, setUser] = useState(undefined);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true)

    const router = useRouter()
    const { isArabic } = useStorefrontI18n();

    useEffect(() => {
        let cancelled = false;
        let unsub = () => {};
        (async () => {
            await waitForAuthReady();
            if (cancelled) return;
            setUser(auth.currentUser ?? null);
            unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null));
        })();
        return () => {
            cancelled = true;
            unsub();
        };
    }, []);

    const fetchOrders = useCallback(async () => {
        try {
            const currentUser = auth.currentUser;
            if (!currentUser) return;

            const token = await currentUser.getIdToken(true);
            await linkGuestOrdersForCurrentUser(currentUser, token);

            const { data } = await axios.get('/api/orders', { headers: { Authorization: `Bearer ${token}` } });
            let list = Array.isArray(data?.orders) ? data.orders : (Array.isArray(data) ? data : []);
            
            // Fetch latest Delhivery tracking status for orders with trackingId
            list = await Promise.all(list.map(async (order) => {
                let updatedOrder = { ...order };
                
                if (order.trackingId) {
                    try {
                        const trackingResponse = await axios.get(`/api/track-order?awb=${order.trackingId}`, { 
                            headers: { Authorization: `Bearer ${token}` } 
                        });
                        if (trackingResponse.data.success && trackingResponse.data.order) {
                            updatedOrder = {
                                ...updatedOrder,
                                delhivery: trackingResponse.data.order.delhivery,
                                status: trackingResponse.data.order.status || updatedOrder.status,
                                trackingUrl: trackingResponse.data.order.trackingUrl || updatedOrder.trackingUrl
                            };
                        }
                    } catch (error) {
                        console.error(`Failed to fetch tracking for ${order.trackingId}:`, error);
                    }
                }
                
                // Auto-mark COD orders as PAID if they're DELIVERED
                const paymentMethod = (updatedOrder.paymentMethod || '').toLowerCase();
                const status = (updatedOrder.status || '').toUpperCase();
                
                if (paymentMethod === 'cod' && status === 'DELIVERED') {
                    updatedOrder.isPaid = true;
                }
                
                // Also check if Delhivery reported payment collected
                if (updatedOrder.delhivery?.payment?.is_cod_recovered && paymentMethod === 'cod') {
                    updatedOrder.isPaid = true;
                }
                
                return updatedOrder;
            }));
            
            setOrders(list);
            setLoading(false);
        } catch (error) {
            console.error('[ORDERS] Fetch error:', error?.response?.data || error.message);
            toast.error(error?.response?.data?.error || 'Failed to load orders');
            setLoading(false);
        }
    }, []);

    const openSignIn = useCallback(() => {
        window.dispatchEvent(new CustomEvent('openSignInModal', { detail: { mode: 'login' } }));
    }, []);

    useEffect(() => {
        if (user === undefined) return;
        if (user) {
            fetchOrders();
        } else {
            setLoading(false);
            openSignIn();
        }
    }, [user, fetchOrders, openSignIn]);

    useEffect(() => {
        const handleGuestOrdersLinked = () => {
            if (auth.currentUser) {
                setLoading(true);
                fetchOrders();
            }
        };

        window.addEventListener(GUEST_ORDERS_LINKED_EVENT, handleGuestOrdersLinked);
        return () => window.removeEventListener(GUEST_ORDERS_LINKED_EVENT, handleGuestOrdersLinked);
    }, [fetchOrders]);

    if(user === undefined || loading){
        return <Loading />
    }

    if(user === null){
        const copy = isArabic
            ? {
                title: 'سجّل الدخول لعرض طلباتك',
                subtitle: 'بعد تسجيل الدخول يمكنك متابعة الحالة والتتبع والإرجاع والفواتير.',
                signIn: 'تسجيل الدخول',
                createAccount: 'إنشاء حساب',
                trackTitle: 'تتبع طلب',
                trackText: 'أدخل رقم الطلب أو رقم التتبع دون تسجيل الدخول.',
                shopTitle: 'تابع التسوق',
                shopText: 'تصفح المنتجات والعروض في المتجر.',
                supportTitle: 'الدعم',
                supportText: 'تحتاج مساعدة لطلب أو توصيل؟ تواصل معنا.',
                benefitsTitle: 'ماذا يمكنك فعله بعد تسجيل الدخول',
                benefits: [
                    'عرض كل الطلبات السابقة والحالية',
                    'تتبع الشحن وتحديثات التوصيل',
                    'طلب إرجاع أو استبدال أو إلغاء',
                    'تنزيل الفواتير وإدارة العنوان',
                ],
            }
            : {
                title: 'Please sign in',
                subtitle: 'Sign in to see your order history, tracking, returns, and invoices.',
                signIn: 'Sign In',
                createAccount: 'Create account',
                trackTitle: 'Track an order',
                trackText: 'Enter your order or tracking number without signing in.',
                shopTitle: 'Continue shopping',
                shopText: 'Browse products and current offers in the store.',
                supportTitle: 'Need help?',
                supportText: 'Contact support for an order or delivery question.',
                benefitsTitle: 'After you sign in you can',
                benefits: [
                    'View all current and past orders',
                    'Track shipping and delivery updates',
                    'Request a return, replacement, or cancellation',
                    'Download invoices and manage your address',
                ],
            };

        const quickLinks = [
            { href: '/track-order', title: copy.trackTitle, text: copy.trackText, icon: PackageSearch },
            { href: '/shop', title: copy.shopTitle, text: copy.shopText, icon: ShoppingBag },
            { href: '/support', title: copy.supportTitle, text: copy.supportText, icon: Headset },
        ];

        return (
            <div className="mx-auto min-h-[70vh] max-w-4xl px-4 py-12" dir={isArabic ? 'rtl' : 'ltr'}>
                <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm sm:px-10">
                    <Truck className="mx-auto mb-4 h-10 w-10 text-orange-500" />
                    <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{copy.title}</h1>
                    <p className="mx-auto mt-3 max-w-xl text-slate-600">{copy.subtitle}</p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                        <button
                            type="button"
                            onClick={openSignIn}
                            className="rounded-lg bg-orange-500 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-600"
                        >
                            {copy.signIn}
                        </button>
                        <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent('openSignInModal', { detail: { mode: 'register' } }))}
                            className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                        >
                            {copy.createAccount}
                        </button>
                    </div>
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                    {quickLinks.map(({ href, title, text, icon: Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-orange-200 hover:shadow-sm"
                        >
                            <Icon className="mb-3 h-5 w-5 text-orange-500" />
                            <p className="font-semibold text-slate-900">{title}</p>
                            <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
                        </Link>
                    ))}
                </div>

                <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
                    <h2 className="text-lg font-semibold text-slate-900">{copy.benefitsTitle}</h2>
                    <ul className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                        {copy.benefits.map((item) => (
                            <li key={item} className="flex gap-2">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-[70vh] mx-6">
            <div className="flex justify-end my-4">
                <button
                    className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
                    onClick={() => router.push('/admin/profile')}
                >
                    Edit Profile
                </button>
            </div>
            {orders.length > 0 ? (
                <div className="my-20 max-w-7xl mx-auto">
                    <PageTitle heading="My Orders" text={`Showing total ${orders.length} orders`} linkText={'Go to home'} />

                    {/* Card-based layout instead of table */}
                    <div className="mt-8 space-y-6">
                        {orders.map((order) => (
                            <OrderItem order={order} key={order._id || order.id} currencySymbol="AED" />
                        ))}
                    </div>
                </div>
            ) : (
                <div className="min-h-[80vh] mx-6 flex items-center justify-center text-slate-400">
                    <h1 className="text-2xl sm:text-4xl font-semibold">You have no orders</h1>
                </div>
            )}
        </div>
    )
}
