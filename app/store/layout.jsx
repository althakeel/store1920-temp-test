'use client'
import StoreLayout from "@/components/store/StoreLayout";
import StoreLanguageScope from "@/components/store/StoreLanguageScope";
import StoreShellSkeleton from "@/components/store/StoreShellSkeleton";
import "@/styles/store-editor.css";

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth"
import { getAuthErrorMessage } from "@/lib/firebaseAuthActions";
import {
    completeStoreGoogleRedirectSignIn,
    startStoreGoogleSignIn,
} from "@/lib/storeGoogleSignIn";
import Link from "next/link";
import { Loader2 } from "lucide-react";

// Client-only skeleton — static fallback must match SSR output to avoid hydration errors
function StoreLoadingShell() {
    return (
        <StoreLanguageScope>
            <StoreShellSkeleton />
        </StoreLanguageScope>
    );
}

const PUBLIC_STORE_PATHS = ['/store/login', '/store/invite/accept'];

function isPublicStorePath(pathname) {
  return PUBLIC_STORE_PATHS.some((path) => pathname === path || pathname?.startsWith(`${path}/`));
}

export default function RootAdminLayout({ children }) {
    const { user, loading } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [isCompletingRedirect, setIsCompletingRedirect] = useState(false);
    const [signInError, setSignInError] = useState('');
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!mounted || loading || user || isPublicStorePath(pathname)) return;

        let cancelled = false;

        (async () => {
            setIsCompletingRedirect(true);
            try {
                const completed = await completeStoreGoogleRedirectSignIn({ router });
                if (cancelled || !completed) return;
            } catch (error) {
                if (!cancelled) {
                    setSignInError(getAuthErrorMessage(error, 'Sign in failed'));
                }
            } finally {
                if (!cancelled) {
                    setIsCompletingRedirect(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [mounted, loading, user, pathname, router]);

    useEffect(() => {
        if (!isSigningIn) return;

        const timeout = setTimeout(() => {
            setIsSigningIn(false);
            setSignInError('Redirect to Google is taking too long. Check your connection or use username/email sign-in.');
        }, 15000);

        return () => clearTimeout(timeout);
    }, [isSigningIn]);

    if (!mounted) {
        return <StoreLoadingShell />;
    }

    if (loading) {
        return <StoreLoadingShell />;
    }

    if (isPublicStorePath(pathname)) {
        return (
            <StoreLanguageScope>
                {children}
            </StoreLanguageScope>
        );
    }

    if (!user) {
        if (isCompletingRedirect) {
            return (
                <StoreLanguageScope>
                    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-gradient-to-br from-slate-100 via-slate-50 to-blue-100 px-4">
                        <div className="rounded-3xl border border-white/70 bg-white/90 p-8 text-center shadow-2xl">
                            <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
                            <p className="mt-4 text-sm text-slate-600">Completing Google sign-in...</p>
                        </div>
                    </div>
                </StoreLanguageScope>
            );
        }

        return (
            <StoreLanguageScope>
            <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-gradient-to-br from-slate-100 via-slate-50 to-blue-100 px-4">
                <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white/90 backdrop-blur-xl shadow-2xl shadow-slate-300/50 p-8 sm:p-10 text-center">
                    <div className="mx-auto mb-5 h-12 w-12 rounded-2xl bg-blue-600/10 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6 text-blue-600" fill="currentColor" aria-hidden="true">
                            <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm0 2a8 8 0 0 1 6.9 12H5.1A8 8 0 0 1 12 4Zm0 16a7.96 7.96 0 0 1-5.46-2.16h10.92A7.96 7.96 0 0 1 12 20Z" />
                        </svg>
                    </div>

                    <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
                    <p className="mt-2 text-sm text-slate-600">Sign in to continue to your store dashboard.</p>

                    <button
                        type="button"
                        onClick={async () => {
                            setSignInError('');
                            setIsSigningIn(true);
                            try {
                                await startStoreGoogleSignIn({
                                    router,
                                    onError: setSignInError,
                                });
                            } catch {
                                // Error message already handled in startStoreGoogleSignIn.
                            } finally {
                                setIsSigningIn(false);
                            }
                        }}
                        disabled={isSigningIn}
                        className="mt-7 w-full inline-flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 hover:shadow disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
                            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.21 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.957 3.043l5.657-5.657C34.046 6.053 29.27 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 13 24 13c3.059 0 5.842 1.154 7.957 3.043l5.657-5.657C34.046 6.053 29.27 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                            <path fill="#4CAF50" d="M24 44c5.168 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.146 35.091 26.715 36 24 36c-5.189 0-9.625-3.327-11.287-7.946l-6.522 5.025C9.504 39.556 16.684 44 24 44z"/>
                            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.046 12.046 0 0 1-4.084 5.57h.003l6.19 5.238C36.97 39.093 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
                        </svg>
                        {isSigningIn ? 'Redirecting to Google...' : 'Sign in with Google'}
                    </button>

                    {isSigningIn ? (
                        <p className="mt-3 text-xs text-slate-500">
                            You will be sent to Google in this tab. Come back here after choosing your account.
                        </p>
                    ) : null}

                    <Link
                        href="/store/login"
                        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                        Sign in with username or email
                    </Link>

                    {signInError ? (
                        <p className="mt-4 text-sm text-red-600">{signInError}</p>
                    ) : null}

                    <p className="mt-4 text-xs text-slate-500">Only authorized accounts can access this area.</p>
                </div>
            </div>
            </StoreLanguageScope>
        );
    }

    return (
        <StoreLanguageScope>
        <StoreLayout>
            {children}
        </StoreLayout>
        </StoreLanguageScope>
    );
}

