"use client";
import { dummyAdminDashboardData } from "@/assets/assets";
import Loading from "@/components/Loading";
import OrdersAreaChart from "@/components/OrdersAreaChart";
import { useEffect, useState } from "react";
import { auth } from '@/lib/firebase';
import { isAdminEmail } from '@/lib/adminEmails';
import axios from "axios";
import { CircleDollarSignIcon, ShoppingBasketIcon, StoreIcon, TagsIcon, UsersIcon } from "lucide-react";
import ContactMessagesAdmin from "./ContactMessagesAdmin.jsx";
import toast from "react-hot-toast";

export default function AdminDashboard() {
    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'AED';
    const [loading, setLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState({
        products: 0,
        revenue: 0,
        orders: 0,
        stores: 0,
        customers: 0,
        allOrders: [],
        ordersChartData: [],
    });
    const [firebaseUser, setFirebaseUser] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            setFirebaseUser(user);
            // Check admin email (client-side env var)
            setIsAdmin(Boolean(user && isAdminEmail(user.email)));
            setChecked(true);
        });
        return () => unsubscribe();
    }, []);

    const dashboardCardsData = [
        { title: 'Total Products', value: dashboardData.products, icon: ShoppingBasketIcon },
        { title: 'Total Revenue', value: currency + dashboardData.revenue, icon: CircleDollarSignIcon },
        { title: 'Total Orders', value: dashboardData.orders, icon: TagsIcon },
        { title: 'Total Stores', value: dashboardData.stores, icon: StoreIcon },
        { title: 'Total Customers', value: dashboardData.customers, icon: UsersIcon },
    ];

    const withTokenRetry = async (requestFn) => {
        try {
            return await requestFn(false);
        } catch (error) {
            if (error?.response?.status === 401) {
                return requestFn(true);
            }
            throw error;
        }
    };

    const fetchDashboardData = async () => {
        if (!firebaseUser) return;
        try {
            const { data } = await withTokenRetry(async (forceRefresh) => {
                const token = await firebaseUser.getIdToken(forceRefresh);
                return axios.get('/api/admin/dashboard', {
                    headers: { Authorization: `Bearer ${token}` }
                });
            });
            setDashboardData(data.dashboardData);
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (firebaseUser && isAdmin) fetchDashboardData();
    }, [firebaseUser, isAdmin]);

    if (!checked) return <Loading />;
    if (!firebaseUser) {
        return (
            <div className="min-h-[80vh] mx-6 flex items-center justify-center text-slate-400">
                <h1 className="text-2xl sm:text-4xl font-semibold">Please <span className="text-slate-500">Login</span> as admin to continue</h1>
            </div>
        );
    }
    if (!isAdmin) {
        return (
            <div className="min-h-[80vh] mx-6 flex items-center justify-center text-slate-400">
                <h1 className="text-2xl sm:text-4xl font-semibold">You are not authorized to view this page.</h1>
            </div>
        );
    }
    if (loading) return <Loading />;

    return (
        <div className="text-slate-500">
            <h1 className="text-2xl">Admin <span className="text-slate-800 font-medium">Dashboard</span></h1>
            {/* Cards */}
            <div className="flex flex-wrap gap-5 my-10 mt-4">
                {
                    dashboardCardsData.map((card, index) => (
                        <div key={index} className="flex items-center gap-10 border border-slate-200 p-3 px-6 rounded-lg">
                            <div className="flex flex-col gap-3 text-xs">
                                <p>{card.title}</p>
                                <b className="text-2xl font-medium text-slate-700">{card.value}</b>
                            </div>
                            <card.icon size={50} className=" w-11 h-11 p-2.5 text-slate-400 bg-slate-100 rounded-full" />
                        </div>
                    ))
                }
            </div>
            {/* Area Chart */}
            <OrdersAreaChart chartData={dashboardData.ordersChartData} />
            {/* Contact Us Messages Section */}
            <div className="mt-12">
                <ContactMessagesAdmin />
            </div>
        </div>
    );
}