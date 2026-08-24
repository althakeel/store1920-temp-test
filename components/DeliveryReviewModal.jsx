'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { auth } from '@/lib/firebase';
import { getDisplayOrderNumber } from '@/lib/orderDisplay';

export default function DeliveryReviewModal({ isOpen, onClose, order, onSubmit, isSubmitting }) {
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploading, setUploading] = useState(false);

  if (!isOpen || !order) return null;

  const handleImageUpload = async (e) => {
    const input = e.target;
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length === 0) return;

    if (uploadedImages.length + files.length > 5) {
      toast.error('Maximum 5 images allowed');
      return;
    }

    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      toast.error('Please sign in again to upload images');
      return;
    }

    setUploading(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          toast.error('Only image files are allowed');
          continue;
        }

        const formData = new FormData();
        formData.append('files', file);
        formData.append('uploadContext', 'delivery-review');

        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const data = await res.json().catch(() => ({}));
        const url = data.url || data.urls?.[0];
        if (res.ok && url) {
          setUploadedImages((prev) => [...prev, url]);
        } else {
          toast.error(data.error || 'Failed to upload image');
        }
      }
    } catch (error) {
      toast.error('Upload failed');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!reviewText.trim()) {
      toast.error('Please enter a review');
      return;
    }

    if (uploadedImages.length === 0) {
      toast.error('Please upload at least one image');
      return;
    }

    onSubmit({
      orderId: order._id,
      rating,
      reviewText: reviewText.trim(),
      images: uploadedImages,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-6 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-900">Delivery Review</h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-500 hover:text-slate-700 text-2xl disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Order Info */}
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-600">Order #{getDisplayOrderNumber(order) || 'Pending'}</p>
            <p className="font-semibold text-slate-900">{order.orderItems?.length || 0} item(s)</p>
          </div>

          {/* Rating */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-3">
              Delivery Rating
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="text-4xl transition-transform hover:scale-110"
                  type="button"
                >
                  {star <= rating ? '⭐' : '☆'}
                </button>
              ))}
            </div>
            <p className="text-sm text-slate-600 mt-2">
              {rating === 5 && 'Excellent delivery experience!'}
              {rating === 4 && 'Good delivery experience'}
              {rating === 3 && 'Average delivery'}
              {rating === 2 && 'Poor delivery'}
              {rating === 1 && 'Very poor delivery'}
            </p>
          </div>

          {/* Review Text */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Your Review
            </label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Share your delivery experience... Was the delivery on time? Was the package intact?"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows="4"
              disabled={isSubmitting}
            />
            <p className="text-xs text-slate-500 mt-1">{reviewText.length} / 1000</p>
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-3">
              Upload Images ({uploadedImages.length}/5)
            </label>
            
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-400 transition cursor-pointer relative">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploading || isSubmitting || uploadedImages.length >= 5}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="pointer-events-none">
                <p className="text-2xl mb-2">📸</p>
                <p className="text-sm font-medium text-slate-900">Click or drag images here</p>
                <p className="text-xs text-slate-500 mt-1">Up to 5 images, PNG/JPG</p>
              </div>
            </div>

            {/* Image Preview */}
            {uploadedImages.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                {uploadedImages.map((image, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={image}
                      alt={`Review image ${idx + 1}`}
                      className="w-full h-24 object-cover rounded-lg border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      disabled={isSubmitting}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {uploading && (
              <p className="text-sm text-blue-600 mt-2">Uploading images...</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !reviewText.trim() || uploadedImages.length === 0}
              className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
