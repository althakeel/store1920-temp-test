'use client'
import { useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Trash2, Copy, RefreshCw, Clock, CheckCircle, XCircle, Eye } from "lucide-react";
import axios from "axios";
import { useAuth } from "@/lib/useAuth";
import { buildCustomerSitePath } from "@/lib/appUrl";

export default function PersonalizedOffersAdmin() {
  const { user, getToken } = useAuth();
  const [storeId, setStoreId] = useState(null);
  const [offers, setOffers] = useState([]);
  const [products, setProducts] = useState([]);
  const [abandonedCarts, setAbandonedCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingCarts, setLoadingCarts] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCart, setSelectedCart] = useState(null);
  
  const [newOffer, setNewOffer] = useState({
    customerEmail: '',
    customerPhone: '',
    customerName: '',
    productId: '',
    discountPercent: 10,
    expiresAt: '',
    notes: ''
  });

  // Fetch store ID
  useEffect(() => {
    const fetchStoreData = async () => {
      if (!user) return;
      
      try {
        const token = await getToken();
        const { data } = await axios.get(`/api/store?userId=${user.uid}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (data.store) {
          setStoreId(data.store._id || data.store.id);
        }
      } catch (error) {
        console.error("Error fetching store:", error);
        toast.error("Failed to load store data");
      }
    };

    fetchStoreData();
  }, [user, getToken]);

  // Fetch offers
  const fetchOffers = async () => {
    if (!storeId) return;
    
    try {
      setLoading(true);
      const { data } = await axios.get(
        `/api/personalized-offers?storeId=${storeId}&status=${statusFilter}`
      );
      setOffers(data.offers || []);
    } catch (error) {
      toast.error("Failed to fetch offers");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch products for dropdown
  const fetchProducts = async () => {
    if (!storeId) return;
    
    setLoadingProducts(true);
    try {
      const token = await getToken();
      const { data } = await axios.get(`/api/store/product`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      console.log('Fetched products:', data.products?.length || 0);
      setProducts(data.products || []);
      
      if (!data.products || data.products.length === 0) {
        toast.error("No products found. Please add products first.");
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to load products");
    } finally {
      setLoadingProducts(false);
    }
  };

  // Fetch abandoned carts
  const fetchAbandonedCarts = async () => {
    if (!storeId) return;
    
    setLoadingCarts(true);
    try {
      const token = await getToken();
      const { data } = await axios.get(`/api/store/abandoned-checkout`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      console.log('Fetched abandoned carts:', data.carts?.length || 0);
      setAbandonedCarts(data.carts || []);
    } catch (error) {
      console.error("Error fetching abandoned carts:", error);
    } finally {
      setLoadingCarts(false);
    }
  };

  // Handle selecting an abandoned cart customer
  const handleSelectAbandonedCart = (cart) => {
    if (!cart) {
      setSelectedCart(null);
      return;
    }

    setSelectedCart(cart);

    const firstItem = cart.items?.[0];
    const rawProductId = firstItem?.productId ?? firstItem?.id ?? '';
    const productId =
      rawProductId && typeof rawProductId === 'object'
        ? String(rawProductId._id || rawProductId.id || '').trim()
        : String(rawProductId || '').trim();

    const matchedProduct = products.find(
      (p) => String(p._id || p.id) === productId
    );

    setNewOffer({
      ...newOffer,
      customerEmail: cart.email || '',
      customerPhone: cart.phone || '',
      customerName: cart.name || '',
      productId: matchedProduct ? String(matchedProduct._id || matchedProduct.id) : productId,
    });

    if (productId && !matchedProduct) {
      toast.error('Cart product not found in your catalog — please select a product manually');
      return;
    }

    toast.success(`Auto-filled details for ${cart.name || cart.email}`);
  };

  useEffect(() => {
    if (storeId) {
      fetchOffers();
      fetchProducts();
      fetchAbandonedCarts();
    }
  }, [storeId, statusFilter]);

  // Handle create offer
  const handleCreateOffer = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!newOffer.customerEmail || !newOffer.productId || !newOffer.expiresAt) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (newOffer.discountPercent < 1 || newOffer.discountPercent > 100) {
      toast.error("Discount must be between 1% and 100%");
      return;
    }

    try {
      const { data } = await axios.post('/api/personalized-offers', {
        ...newOffer,
        storeId
      });

      toast.success("Offer created successfully!");
      
      // Copy URL to clipboard
      if (data.offer?.offerUrl) {
        await navigator.clipboard.writeText(data.offer.offerUrl);
        toast.success("Offer URL copied to clipboard!");
      }

      // Reset form
      setNewOffer({
        customerEmail: '',
        customerPhone: '',
        customerName: '',
        productId: '',
        discountPercent: 10,
        expiresAt: '',
        notes: ''
      });
      
      setShowCreateForm(false);
      fetchOffers();
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to create offer");
    }
  };

  // Handle delete offer
  const handleDeleteOffer = async (offerId) => {
    if (!window.confirm("Are you sure you want to delete this offer?")) return;

    try {
      await axios.delete(`/api/personalized-offers?offerId=${offerId}`);
      toast.success("Offer deleted successfully");
      fetchOffers();
    } catch (error) {
      toast.error("Failed to delete offer");
    }
  };

  // Copy customer-facing offer URL (token lets the page resolve the exact offer)
  const copyOfferUrl = async (token, productSlug) => {
    const slug = String(productSlug || '').trim();
    const offerUrl = slug
      ? buildCustomerSitePath(`/offer/${encodeURIComponent(slug)}?token=${encodeURIComponent(token)}`)
      : buildCustomerSitePath(`/offer/${token}`);

    try {
      await navigator.clipboard.writeText(offerUrl);
      toast.success("Offer URL copied to clipboard!");
    } catch (error) {
      toast.error("Failed to copy URL");
    }
  };

  // Get status badge
  const getStatusBadge = (offer) => {
    if (offer.isUsed) {
      return <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full flex items-center gap-1">
        <CheckCircle size={12} /> Used
      </span>;
    }
    if (offer.isExpired) {
      return <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full flex items-center gap-1">
        <XCircle size={12} /> Expired
      </span>;
    }
    if (offer.isValid) {
      return <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full flex items-center gap-1">
        <Clock size={12} /> Active
      </span>;
    }
    return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">Inactive</span>;
  };

  // Calculate time remaining
  const getTimeRemaining = (expiresAt) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry - now;
    
    if (diff <= 0) return "Expired";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Personalized Offers</h1>
          <p className="text-gray-600 mt-1">Create time-limited exclusive discounts for specific customers</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          {showCreateForm ? 'Cancel' : '+ Create New Offer'}
        </button>
      </div>

      {/* Create Offer Form */}
      {showCreateForm && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Create Personalized Offer</h2>
          
          {/* Quick Select from Abandoned Checkouts */}
          {abandonedCarts.length > 0 && (
            <div className="mb-6 p-4 bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">🛒</span>
                <h3 className="font-semibold text-gray-800">Quick Create from Abandoned Checkout</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Select a customer who left items in cart - we'll auto-fill their details!
              </p>
              
              <div className="grid gap-2">
                {loadingCarts ? (
                  <div className="text-sm text-gray-500">Loading abandoned carts...</div>
                ) : (
                  <select
                    value={selectedCart?._id || ''}
                    onChange={(e) => {
                      const cart = abandonedCarts.find(c => c._id === e.target.value);
                      handleSelectAbandonedCart(cart);
                    }}
                    className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white"
                  >
                    <option value="">Select an abandoned cart customer...</option>
                    {abandonedCarts.map((cart) => (
                      <option key={cart._id} value={cart._id}>
                        {cart.name || cart.email} - AED{cart.cartTotal?.toFixed(2) || 0} 
                        ({cart.items?.length || 0} item{cart.items?.length !== 1 ? 's' : ''})
                        {cart.lastSeenAt && ` - ${new Date(cart.lastSeenAt).toLocaleDateString()}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              
              {selectedCart && (
                <div className="mt-3 p-3 bg-white rounded border border-orange-200">
                  <div className="text-sm">
                    <strong>Selected:</strong> {selectedCart.name || selectedCart.email}
                    <br />
                    <strong>Cart Total:</strong> AED{selectedCart.cartTotal?.toFixed(2) || 0}
                    <br />
                    <strong>Items:</strong> {selectedCart.items?.length || 0}
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleCreateOffer} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Customer Email *
              </label>
              <input
                type="email"
                required
                value={newOffer.customerEmail}
                onChange={(e) => setNewOffer({ ...newOffer, customerEmail: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="customer@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Customer Name
              </label>
              <input
                type="text"
                value={newOffer.customerName}
                onChange={(e) => setNewOffer({ ...newOffer, customerName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Customer Phone
              </label>
              <input
                type="tel"
                value={newOffer.customerPhone}
                onChange={(e) => setNewOffer({ ...newOffer, customerPhone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="+1234567890"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product *
              </label>
              {loadingProducts ? (
                <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                  Loading products...
                </div>
              ) : products.length === 0 ? (
                <div className="w-full px-3 py-2 border border-red-300 rounded-lg bg-red-50 text-red-700">
                  No products available. Please add products first.
                </div>
              ) : (
                <select
                  required
                  value={newOffer.productId}
                  onChange={(e) => setNewOffer({ ...newOffer, productId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Select a product</option>
                  {products.map((product) => (
                    <option key={product._id || product.id} value={product._id || product.id}>
                      {product.name} - AED{product.price}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Discount Percent *
              </label>
              <input
                type="number"
                required
                min="1"
                max="100"
                value={newOffer.discountPercent}
                onChange={(e) => setNewOffer({ ...newOffer, discountPercent: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="10"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expires At *
              </label>
              <input
                type="datetime-local"
                required
                value={newOffer.expiresAt}
                onChange={(e) => setNewOffer({ ...newOffer, expiresAt: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (Optional)
              </label>
              <textarea
                value={newOffer.notes}
                onChange={(e) => setNewOffer({ ...newOffer, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows="2"
                placeholder="Internal notes about this offer..."
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Create Offer & Copy Link
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {['all', 'active', 'expired', 'used'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-lg capitalize transition ${
              statusFilter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {status}
          </button>
        ))}
        <button
          onClick={fetchOffers}
          className="ml-auto px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Offers List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : offers.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-md">
          <p className="text-gray-500">No offers found. Create your first personalized offer!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {offers.map((offer) => (
            <div key={offer._id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {offer.product?.images?.[0] && (
                      <img
                        src={offer.product.images[0]}
                        alt={offer.product.name}
                        className="w-16 h-16 object-cover rounded"
                      />
                    )}
                    <div>
                      <h3 className="font-semibold text-lg">{offer.product?.name || 'Product Deleted'}</h3>
                      <p className="text-sm text-gray-600">{offer.customerName || offer.customerEmail}</p>
                    </div>
                    {getStatusBadge(offer)}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                    <div>
                      <span className="text-gray-500">Discount:</span>
                      <p className="font-semibold text-red-600">{offer.discountPercent}% OFF</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <p className="font-medium">{offer.customerEmail}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Expires:</span>
                      <p className="font-medium">{format(new Date(offer.expiresAt), 'MMM dd, yyyy HH:mm')}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Time Left:</span>
                      <p className="font-medium text-blue-600">{getTimeRemaining(offer.expiresAt)}</p>
                    </div>
                  </div>

                  {offer.notes && (
                    <p className="text-sm text-gray-600 mt-2 italic">Note: {offer.notes}</p>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => copyOfferUrl(offer.offerToken, offer.product?.slug)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    title="Copy offer link"
                  >
                    <Copy size={18} />
                  </button>
                  <button
                    onClick={() => {
                      const slug = String(offer.product?.slug || '').trim();
                      const token = offer.offerToken;
                      const path = slug
                        ? `/offer/${encodeURIComponent(slug)}?token=${encodeURIComponent(token)}`
                        : `/offer/${token}`;
                      window.open(path, '_blank');
                    }}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                    title="Preview offer"
                  >
                    <Eye size={18} />
                  </button>
                  <button
                    onClick={() => handleDeleteOffer(offer._id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Delete offer"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
