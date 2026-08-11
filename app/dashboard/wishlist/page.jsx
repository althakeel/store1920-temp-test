'use client'
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import axios from "axios";
import Image from "@/components/SafeNextImage";
import { HeartIcon, ShoppingCartIcon, TrashIcon, StarIcon, CheckCircle2 } from "lucide-react";
import { useDispatch } from "react-redux";
import { addToCart } from "@/lib/features/cart/cartSlice";
import { trackProductAddToCart } from '@/lib/ecommerceTracking';
import { STORE_CURRENCY } from '@/lib/storeCurrency';
import Loading from "@/components/Loading";
import DashboardSidebar from "@/components/DashboardSidebar";
import Link from "next/link";

export default function DashboardWishlistPage() {
    const router = useRouter();
    const dispatch = useDispatch();
    const [user, setUser] = useState(undefined);
    const [wishlist, setWishlist] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedItems, setSelectedItems] = useState([]);
    const [addingToCart, setAddingToCart] = useState(false);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null));
        return () => unsub();
    }, []);

    useEffect(() => {
        if (user) {
            fetchWishlist();
        } else if (user === null) {
            setLoading(false);
        }
    }, [user]);

    const fetchWishlist = async () => {
        try {
            setLoading(true);
            const token = await user.getIdToken();
            const { data } = await axios.get('/api/wishlist', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setWishlist(data.wishlist);
        } catch (error) {
            console.error('Error fetching wishlist:', error);
        } finally {
            setLoading(false);
        }
    };

    const removeFromWishlist = async (productId) => {
        try {
            const token = await user.getIdToken();
            await axios.post('/api/wishlist', {
                productId,
                action: 'remove'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setWishlist(wishlist.filter(item => item.productId !== productId));
            setSelectedItems(selectedItems.filter(id => id !== productId));
            
            // Dispatch event to update navbar count
            window.dispatchEvent(new Event('wishlistUpdated'));
        } catch (error) {
            console.error('Error removing from wishlist:', error);
        }
    };

    const handleAddToCart = (product) => {
        const productId = product?._id || product?.id;
        if (!productId) return;
        trackProductAddToCart({
            productId,
            name: product?.name || product?.title || 'Product',
            price: Number(product?.price) || 0,
            quantity: 1,
            currency: STORE_CURRENCY,
        });
        dispatch(addToCart({
            productId,
            price: Number(product?.price) || 0,
        }));
    };

    const toggleSelectItem = (productId) => {
        setSelectedItems(prev => 
            prev.includes(productId) 
                ? prev.filter(id => id !== productId)
                : [...prev, productId]
        );
    };

    const selectAllItems = () => {
        if (selectedItems.length === wishlist.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(wishlist.map(item => item.productId));
        }
    };

    const addSelectedToCart = async () => {
        if (selectedItems.length === 0) return;
        
        setAddingToCart(true);
        try {
            selectedItems.forEach(productId => {
                const item = wishlist.find(w => w.productId === productId);
                if (item) {
                    handleAddToCart(item.product);
                }
            });
            
            // Show success message
            alert(`Added ${selectedItems.length} item(s) to cart!`);
        } catch (error) {
            console.error('Error adding to cart:', error);
            alert('Failed to add some items to cart');
        } finally {
            setAddingToCart(false);
        }
    };

    const calculateTotal = () => {
        return selectedItems.reduce((total, productId) => {
            const item = wishlist.find(w => w.productId === productId);
            return total + (item?.product?.price || 0);
        }, 0);
    };

    if (user === undefined || loading) return <Loading />;

    if (user === null) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-10 min-h-[50dvh]">
                <h1 className="text-2xl font-semibold text-slate-800 mb-3">My Wishlist</h1>
                <p className="text-slate-600 mb-6">Please sign in to view your wishlist.</p>
                <Link href="/" className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg">Go to Home</Link>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 min-h-[50dvh] grid grid-cols-1 md:grid-cols-4 gap-6">
            <DashboardSidebar />
            <main className="md:col-span-3">
                    <h1 className="text-2xl font-semibold text-slate-800 mb-6">My Wishlist</h1>

                    {wishlist.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center">
                            <HeartIcon size={64} className="mx-auto text-gray-300 mb-4" />
                            <h2 className="text-xl font-bold text-gray-800 mb-2">Your wishlist is empty</h2>
                            <p className="text-gray-600 mb-6">Start adding products you love!</p>
                            <button
                                onClick={() => router.push('/products')}
                                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
                            >
                                Browse Products
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Selection Controls */}
                            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedItems.length === wishlist.length}
                                        onChange={selectAllItems}
                                        className="w-4 h-4"
                                    />
                                    <span className="text-sm text-slate-700">
                                        {selectedItems.length > 0 ? `${selectedItems.length} selected` : 'Select all'}
                                    </span>
                                </div>
                                {selectedItems.length > 0 && (
                                    <button
                                        onClick={addSelectedToCart}
                                        disabled={addingToCart}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                                    >
                                        <ShoppingCartIcon size={16} />
                                        {addingToCart ? 'Adding...' : 'Add to Cart'}
                                    </button>
                                )}
                            </div>

                            {/* Wishlist Items */}
                            <div className="space-y-3">
                                {wishlist.map((item) => (
                                    <div key={item.productId} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                                        <div className="flex gap-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.includes(item.productId)}
                                                onChange={() => toggleSelectItem(item.productId)}
                                                className="w-4 h-4 mt-2"
                                            />
                                            <div className="relative w-24 h-24 flex-shrink-0">
                                                <Image
                                                    src={item.product?.images?.[0] || '/placeholder.png'}
                                                    alt={item.product?.name}
                                                    fill
                                                    className="object-cover rounded-lg"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-semibold text-slate-800 mb-1">{item.product?.name}</h3>
                                                <p className="text-sm text-slate-600 mb-2 line-clamp-2">{item.product?.description}</p>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-lg font-bold text-slate-900">AED{item.product?.price}</span>
                                                    {item.product?.AED > item.product?.price && (
                                                        <span className="text-sm text-slate-500 line-through">AED{item.product?.AED}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    onClick={() => handleAddToCart(item.product)}
                                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                                                >
                                                    Add to Cart
                                                </button>
                                                <button
                                                    onClick={() => removeFromWishlist(item.productId)}
                                                    className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition text-sm"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Summary */}
                            {selectedItems.length > 0 && (
                                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-slate-600">{selectedItems.length} items selected</p>
                                            <p className="text-xl font-bold text-slate-900">AED{calculateTotal().toFixed(2)}</p>
                                        </div>
                                        <button
                                            onClick={addSelectedToCart}
                                            disabled={addingToCart}
                                            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                                        >
                                            <ShoppingCartIcon size={18} />
                                            {addingToCart ? 'Adding...' : 'Add Selected to Cart'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>
        );
}