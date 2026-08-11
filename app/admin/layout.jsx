
'use client';
import AdminLayout from "@/components/admin/AdminLayout";
import Loading from "@/components/Loading";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { auth } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/adminEmails";

export default function RootAdminLayout({ children }) {
    const pathname = usePathname();
    const [user, setUser] = useState(undefined);
    const [isAdmin, setIsAdmin] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((u) => {
            setUser(u);
            setIsAdmin(Boolean(u && isAdminEmail(u.email)));
            setReady(true);
        });
        return () => unsubscribe();
    }, []);

    if (pathname?.startsWith('/admin/sign-in')) {
        return children;
    }
    if (!ready) {
        return <Loading />;
    }
    if (!user || !isAdmin) {
        return children;
    }
    return (
        <AdminLayout>
            {children}
        </AdminLayout>
    );
}
