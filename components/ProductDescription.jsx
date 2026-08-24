'use client'
import { ArrowRight, ChevronDown, ChevronUp, StarIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import toast from "react-hot-toast"
import ProductCard from "./ProductCard"
import { useSelector } from "react-redux"
import { PRODUCT_RICH_CONTENT_CLASS, sanitizeProductRichHtml } from "@/lib/productRichContent"
import { pickAPlusModules } from "@/lib/aPlusContent"
import { useStorefrontI18n } from "@/lib/useStorefrontI18n"
import { useProductWishlist } from "@/lib/useProductWishlist"
import { getProductAbsoluteUrl } from "@/lib/productUrl"
import { toPublicCategoryPath } from "@/lib/categorySlug"

const formatReviewDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const maskReviewerName = (name) => {
    const safeName = (name || 'Guest User').trim()
    if (safeName.length <= 2) return `${safeName[0] || 'U'}***`
    if (safeName.length <= 5) return `${safeName.slice(0, 2)}***`
    return `${safeName.slice(0, 3)}***${safeName.slice(-1)}`
}

const toTitleCase = (value) => value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

function stripEmbeddedSpecTable(html = '') {
    return String(html || '')
        .replace(/<h2[^>]*>[^<]*(?:product\s+information|product\s+specifications|specifications)[^<]*<\/h2>\s*/gi, '')
        .replace(/<h3[^>]*>[^<]*(?:product\s+information|product\s+specifications|specifications)[^<]*<\/h3>\s*/gi, '')
        .replace(/<table[\s\S]*?<\/table>/gi, '')
        .trim()
}

// Updated design - Noon.com style v2
const ProductDescription = ({
    product,
    reviews = [],
    loadingReviews = false,
    onReviewAdded,
    showSuggestedProducts = true,
    showMainDescription = true,
    showOverviewSections = true,
    compactMobile = false,
    aPlusViewport = 'auto',
}) => {

    const router = useRouter()
    const { t, isArabic } = useStorefrontI18n()
    const { isInWishlist, loading: wishlistLoading, toggleWishlist } = useProductWishlist(product)
    const [showReportModal, setShowReportModal] = useState(false)
    const [reportReason, setReportReason] = useState('incorrect-information')
    const [reportDetails, setReportDetails] = useState('')

    const handleSave = async () => {
        if (wishlistLoading) return;

        const result = await toggleWishlist();
        if (result === 'added') {
            toast.success('Saved to your wishlist');
        } else if (result === 'removed') {
            toast.success('Removed from your wishlist');
        } else if (result === 'error') {
            toast.error('Could not update wishlist. Please try again.');
        } else {
            toast.error('Unable to save this product right now.');
        }
    }

    const handleSubmitReport = (event) => {
        event.preventDefault()
        const productLabel = product?.name || 'Unknown product'
        const productRef = product?.slug || product?._id || ''
        const reasonLabels = {
            'incorrect-information': 'Incorrect product information',
            'counterfeit': 'Suspected counterfeit item',
            'offensive': 'Offensive or inappropriate content',
            'other': 'Other issue',
        }
        const reasonLabel = reasonLabels[reportReason] || reportReason
        const message = [
            `Report type: ${reasonLabel}`,
            `Product: ${productLabel}`,
            productRef ? `Product link: ${getProductAbsoluteUrl(product, typeof window !== 'undefined' ? window.location.origin : '')}` : '',
            reportDetails.trim() ? `Details: ${reportDetails.trim()}` : '',
        ].filter(Boolean).join('\n')

        if (typeof window !== 'undefined') {
            sessionStorage.setItem('productReportDraft', JSON.stringify({
                subject: 'Product report',
                message,
            }))
        }

        setShowReportModal(false)
        setReportDetails('')
        router.push('/contact-us?source=product-report')
    }

    // Use reviews and loadingReviews from props only
    const [suggestedProducts, setSuggestedProducts] = useState([])
    const allProducts = useSelector((state) => state.product.list || [])
    const [lightboxImage, setLightboxImage] = useState(null)
    const [showVerifiedInfo, setShowVerifiedInfo] = useState(false)
    const [visibleReviews] = useState(2)
    const [showAllReviewsModal, setShowAllReviewsModal] = useState(false)
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
    const [isAboutExpanded, setIsAboutExpanded] = useState(false)
    const rawDescription = (isArabic && product?.descriptionAr) ? product.descriptionAr : (product?.description || '')
    const normalizedDescription = useMemo(
        () => sanitizeProductRichHtml(rawDescription),
        [rawDescription]
    )

    // Calculate rating distribution
    const ratingCounts = [0, 0, 0, 0, 0]
    reviews.forEach(review => {
        if (review.rating >= 1 && review.rating <= 5) {
            ratingCounts[review.rating - 1]++
        }
    })

    const averageRating = reviews.length > 0
        ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
        : 0

    const reviewKeywordPills = useMemo(() => {
        // No fallback pills - only show real reviews from backend
        if (!Array.isArray(reviews) || reviews.length === 0) return []

        const stopWords = new Set([
            'the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'was', 'were', 'from', 'have',
            'has', 'had', 'not', 'but', 'very', 'just', 'also', 'really', 'will', 'would', 'could', 'should',
            'its', 'it', 'they', 'them', 'their', 'our', 'out', 'into', 'onto', 'about', 'after', 'before',
            'been', 'being', 'can', 'cant', 'did', 'didnt', 'does', 'doesnt', 'dont', 'get', 'got', 'gotten',
            'item', 'product', 'order', 'delivery', 'shipping', 'arrived', 'good', 'nice', 'great', 'best',
            'bad', 'poor', 'ok', 'okay', 'use', 'used', 'using', 'one', 'two', 'buy', 'bought'
        ])

        const wordFrequency = new Map()
        const phraseFrequency = new Map()

        reviews.forEach((review) => {
            const rawText = String(review?.review || '').toLowerCase()
            if (!rawText.trim()) return

            const tokens = rawText
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/)
                .map((w) => w.trim())
                .filter((w) => w.length >= 3 && !stopWords.has(w) && !/^\d+$/.test(w))

            if (tokens.length === 0) return

            const uniqueWordsInReview = new Set(tokens)
            uniqueWordsInReview.forEach((word) => {
                wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1)
            })

            const uniquePhrasesInReview = new Set()
            for (let i = 0; i < tokens.length - 1; i++) {
                const phrase = `${tokens[i]} ${tokens[i + 1]}`
                uniquePhrasesInReview.add(phrase)
            }

            uniquePhrasesInReview.forEach((phrase) => {
                phraseFrequency.set(phrase, (phraseFrequency.get(phrase) || 0) + 1)
            })
        })

        const phraseCandidates = [...phraseFrequency.entries()]
            .filter(([, count]) => count >= 2)
            .map(([label, count]) => ({ label: toTitleCase(label), count }))

        const wordCandidates = [...wordFrequency.entries()]
            .filter(([, count]) => count >= 2)
            .map(([label, count]) => ({ label: toTitleCase(label), count }))

        const pills = [...phraseCandidates, ...wordCandidates]
            .sort((a, b) => b.count - a.count || a.label.length - b.label.length)
            .filter((pill, idx, arr) => arr.findIndex((x) => x.label === pill.label) === idx)
            .slice(0, 3)

        return pills  // Return only real pills from backend reviews, no fallback
    }, [reviews])

    const openReviewImage = (img, fromAllReviewsModal = false) => {
        if (fromAllReviewsModal) {
            setShowAllReviewsModal(false)
        }
        setLightboxImage(img)
    }

    const renderReviewItem = (item, idx, fromAllReviewsModal = false) => {
        const reviewerName = item.user?.name || item.userId?.name || item.customerName || 'Guest User'

        return (
            <div key={item.id || item._id || idx}>
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-8 w-8 rounded-full bg-gray-200 text-gray-600 text-xs font-semibold flex items-center justify-center overflow-hidden">
                        {reviewerName[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1">
                        <div className="text-sm text-gray-700">
                            <span className="font-medium text-gray-900">{maskReviewerName(reviewerName)}</span>
                            <span className="mx-1">in 🇦🇪 on {formatReviewDate(item.createdAt)}</span>
                        </div>

                        <div className="mt-2 flex items-center gap-0.5">
                            {Array(5).fill('').map((_, i) => (
                                <StarIcon
                                    key={i}
                                    size={17}
                                    className="text-transparent"
                                    fill={i < (item.rating || 0) ? '#111827' : '#D1D5DB'}
                                />
                            ))}
                        </div>

                        <p className="mt-2 text-[15px] leading-7 text-gray-900">{item.review}</p>

                        {item.images && item.images.length > 0 && (
                            <div className="mt-3 flex gap-2 flex-wrap">
                                {item.images.map((img, imageIdx) => (
                                    <Image
                                        key={imageIdx}
                                        src={img}
                                        alt={`Review image ${imageIdx + 1}`}
                                        width={76}
                                        height={76}
                                        className="rounded-md object-cover border border-gray-200 cursor-pointer"
                                        onClick={() => openReviewImage(img, fromAllReviewsModal)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    const descriptionHasTable = /<table[\s>]/i.test(normalizedDescription)
    const specTableColumns = (() => {
        const englishColumns = Array.isArray(product?.specTableColumns) && product.specTableColumns.length > 0
            ? product.specTableColumns
            : (Array.isArray(product?.attributes?.specTableColumns) && product.attributes.specTableColumns.length > 0
                ? product.attributes.specTableColumns
                : ['Property', 'Value'])
        const arabicColumns = Array.isArray(product?.attributes?.specTableColumnsAr) && product.attributes.specTableColumnsAr.length > 0
            ? product.attributes.specTableColumnsAr
            : ['الخاصية', 'القيمة']
        return isArabic ? arabicColumns : englishColumns
    })()
    const specTableRows = (() => {
        const englishRows = Array.isArray(product?.specTableRows)
            ? product.specTableRows
            : (Array.isArray(product?.attributes?.specRows) ? product.attributes.specRows : [])
        const arabicRows = Array.isArray(product?.attributes?.specRowsAr) ? product.attributes.specRowsAr : []
        const sourceRows = isArabic && arabicRows.length > 0 ? arabicRows : englishRows
        return sourceRows
            .filter((row) => Array.isArray(row) && row.some((cell) => String(cell || '').trim().length > 0))
            .map((row) => Array.from({ length: specTableColumns.length }, (_, idx) => String(row[idx] || '').trim()))
    })()
    const hasStructuredSpecData = Boolean(
        (product?.specTableEnabled ?? product?.attributes?.specTableEnabled) && specTableRows.length > 0
    )
    const showSpecTable = hasStructuredSpecData
    const descriptionForDisplay = useMemo(() => {
        if (!descriptionHasTable || !hasStructuredSpecData) return normalizedDescription
        return stripEmbeddedSpecTable(normalizedDescription)
    }, [normalizedDescription, descriptionHasTable, hasStructuredSpecData])
    const descriptionPlainTextForCollapse = descriptionForDisplay.replace(/<[^>]*>/g, '').trim()
    const shouldCollapseDescription = descriptionPlainTextForCollapse.length > 280
    const normalizedShortDescription2 = useMemo(
        () => sanitizeProductRichHtml(
            isArabic
                ? (product?.attributes?.shortDescription2Ar || product?.shortDescription2Ar || product?.shortDescription2 || product?.attributes?.shortDescription2 || '')
                : (product?.shortDescription2 || product?.attributes?.shortDescription2 || '')
        ),
        [isArabic, product?.shortDescription2, product?.attributes?.shortDescription2, product?.attributes?.shortDescription2Ar, product?.shortDescription2Ar]
    )
    const aboutPlainText = normalizedShortDescription2.replace(/<[^>]*>/g, '').trim()
    const hasShortDescription2 = aboutPlainText.length > 0
    const shouldCollapseAbout = aboutPlainText.length > 180

    const resolvedAPlusViewport = aPlusViewport === 'auto'
        ? (compactMobile ? 'mobile' : 'desktop')
        : aPlusViewport
    const aPlusModules = useMemo(
        () => pickAPlusModules({
            product,
            viewport: resolvedAPlusViewport,
            isArabic,
        }),
        [
            product,
            resolvedAPlusViewport,
            isArabic,
        ],
    )
    const aPlusHtml = useMemo(() => sanitizeProductRichHtml(aPlusModules.html), [aPlusModules.html])
    const hasAPlusContent = aPlusModules.hasContent || Boolean(aPlusHtml)

    useEffect(() => {
        if (!showSuggestedProducts) return
        fetchSuggestedProducts()
    }, [product._id, allProducts, showSuggestedProducts])

    const fetchSuggestedProducts = () => {
        // Filter products by same category or tags, exclude current product
        const related = allProducts.filter(p => {
            if (p._id === product._id) return false
            
            // Match by category
            if (p.category === product.category) return true
            
            // Match by tags if they exist
            if (product.tags && p.tags) {
                const productTags = Array.isArray(product.tags) ? product.tags : []
                const pTags = Array.isArray(p.tags) ? p.tags : []
                return productTags.some(tag => pTags.includes(tag))
            }
            
            return false
        })
        
        // Shuffle and take first 8 products
        const shuffled = related.sort(() => 0.5 - Math.random())
        setSuggestedProducts(shuffled.slice(0, 8))
    }

    // Remove fetchReviews and handleReviewAdded, use parent handler

    return (
        <div className={compactMobile ? 'flex flex-col' : 'mt-3 flex flex-col gap-2 sm:gap-3'} dir={isArabic ? 'rtl' : 'ltr'}>

            {showOverviewSections && hasShortDescription2 && !compactMobile && (
                <div className="order-1 bg-white border-t border-gray-200 pt-4 sm:pt-5">
                    <h2 className="text-[30px] leading-none font-semibold text-gray-900 mb-3">{t('product.aboutThisItem')}</h2>
                    <div className="relative">
                        <div
                        className={`${PRODUCT_RICH_CONTENT_CLASS} text-[16px] leading-7
                        ${shouldCollapseAbout && !isAboutExpanded ? 'overflow-hidden [display:-webkit-box] [-webkit-line-clamp:4] [-webkit-box-orient:vertical]' : ''}`}
                        dir={isArabic ? 'rtl' : 'ltr'}
                        dangerouslySetInnerHTML={{ __html: normalizedShortDescription2 }}
                        />

                        {shouldCollapseAbout && !isAboutExpanded && (
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent" />
                        )}
                    </div>

                    {shouldCollapseAbout && (
                        <div className="mt-2">
                            <button
                                onClick={() => setIsAboutExpanded((prev) => !prev)}
                                className="text-[12px] text-gray-600 hover:text-gray-900 hover:underline"
                            >
                                {isAboutExpanded ? t('product.viewLess') : t('common.viewMore')}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {showOverviewSections && showSpecTable && (
                <div className={`order-2 bg-white ${compactMobile ? 'border-t border-gray-100 px-4 py-2.5' : 'border-t border-gray-300 pt-4 sm:pt-5'}`}>
                    <h3 className={`${compactMobile ? 'text-[15px] font-bold mb-2' : 'text-[28px] leading-none font-semibold mb-3'} text-gray-900`}>
                        {(
                            isArabic
                                ? (product?.attributes?.specTableTitleAr || product?.specTableTitleAr)
                                : (product?.attributes?.specTableTitle || product?.specTableTitle)
                        ) || t('product.productInformation')}
                    </h3>
                    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                        <table className="w-full border-collapse table-fixed">
                            <tbody>
                                {specTableRows.map((row, rowIdx) => (
                                    <tr key={`spec-row-${rowIdx}`} className={`${rowIdx !== specTableRows.length - 1 ? 'border-b border-gray-200' : ''}`}>
                                        {specTableColumns.map((_, colIdx) => (
                                            colIdx === 0 ? (
                                                <th
                                                    key={`spec-cell-${rowIdx}-${colIdx}`}
                                                    scope="row"
                                                    className="w-[42%] bg-gray-50 px-4 py-3 text-left text-[14px] font-semibold text-gray-900 align-top"
                                                >
                                                    {row[colIdx] || '-'}
                                                </th>
                                            ) : (
                                                <td
                                                    key={`spec-cell-${rowIdx}-${colIdx}`}
                                                    className="px-4 py-3 text-[14px] text-gray-700 leading-6 align-top break-words border-l border-gray-100"
                                                >
                                                    {row[colIdx] || '-'}
                                                </td>
                                            )
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showMainDescription && (
                <div className={`${compactMobile ? 'order-1' : 'order-3'} bg-white ${compactMobile ? 'px-4 py-2.5' : 'border-t border-gray-200 pt-4'}`} dir={isArabic ? 'rtl' : 'ltr'}>
                    <div className={`${compactMobile ? 'mb-2' : 'mb-3'} flex items-center justify-between gap-3`}>
                        <h2 className={`${compactMobile ? 'text-[15px] font-bold' : 'text-[18px] font-semibold'} leading-none text-gray-900`}>{t('product.productDetails')}</h2>
                        <div className="flex shrink-0 items-center gap-2 text-[13px] text-gray-800">
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={wishlistLoading}
                                className={`hover:underline disabled:opacity-60 ${isInWishlist ? 'text-red-600 font-medium' : ''}`}
                            >
                                {isInWishlist ? t('common.saved') : t('common.save')}
                            </button>
                            <span className="text-gray-400">|</span>
                            <button
                                type="button"
                                onClick={() => setShowReportModal(true)}
                                className="hover:underline"
                            >
                                {t('product.reportItem')}
                            </button>
                        </div>
                    </div>

                    <div className="relative">
                        <div
                            className={`${PRODUCT_RICH_CONTENT_CLASS} ${shouldCollapseDescription && !isDescriptionExpanded ? 'overflow-hidden [display:-webkit-box] [-webkit-line-clamp:8] [-webkit-box-orient:vertical]' : ''}`}
                            dir={isArabic ? 'rtl' : 'ltr'}
                            dangerouslySetInnerHTML={{ __html: descriptionForDisplay }}
                        />

                        {shouldCollapseDescription && !isDescriptionExpanded && (
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
                        )}
                    </div>

                    {shouldCollapseDescription && (
                        <div className={`${compactMobile ? 'mt-2' : 'mt-3'} text-center`}>
                            <button
                                onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                                className="inline-flex items-center gap-1 text-[13px] text-gray-800 hover:text-gray-900"
                            >
                                {isDescriptionExpanded ? t('product.seeLess') : t('product.seeMore')}
                                {isDescriptionExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {showMainDescription && hasAPlusContent ? (
                <div
                    className={`${compactMobile ? 'order-1' : 'order-3'} bg-white ${compactMobile ? 'border-t border-gray-100 py-3' : 'border-t border-gray-200 pt-6 mt-2'}`}
                    dir={isArabic ? 'rtl' : 'ltr'}
                >
                    {aPlusModules.images.length > 0 ? (
                        <div className={compactMobile ? '' : 'space-y-0'}>
                            {aPlusModules.images.map((src, index) => (
                                <img
                                    key={`${src}-${index}`}
                                    src={src}
                                    alt=""
                                    className="block h-auto w-full"
                                    loading="lazy"
                                />
                            ))}
                        </div>
                    ) : null}
                    {aPlusHtml ? (
                        <div
                            className={`${PRODUCT_RICH_CONTENT_CLASS} ${compactMobile ? 'px-4 pt-3' : aPlusModules.images.length ? 'pt-4' : ''}`}
                            dir={isArabic ? 'rtl' : 'ltr'}
                            dangerouslySetInnerHTML={{ __html: aPlusHtml }}
                        />
                    ) : null}
                </div>
            ) : null}

            {/* Suggested Products Section */}
            {showSuggestedProducts && suggestedProducts.length > 0 && (
                <div className="order-4 bg-white border-0 md:border md:border-gray-200 mt-6">
                    <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900">{t('product.youMayAlsoLike')}</h2>
                        {product.category && (
                            <Link 
                                href={toPublicCategoryPath(product.category)}
                                className="text-sm text-orange-500 hover:text-orange-600 font-medium flex items-center gap-1"
                            >
                                {t('product.viewAllLink')} <ArrowRight size={16} className={isArabic ? 'rotate-180' : ''} />
                            </Link>
                        )}
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-2 items-stretch gap-3 md:grid-cols-3 lg:grid-cols-6">
                            {suggestedProducts.map((suggestedProduct) => (
                                <ProductCard key={suggestedProduct._id} product={suggestedProduct} />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Image Lightbox Modal */}
            {lightboxImage && (
                <div 
                    className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setLightboxImage(null)}
                >
                    <div className="relative max-w-4xl max-h-[90vh]">
                        <button
                            onClick={() => setLightboxImage(null)}
                            className="absolute -top-10 right-0 text-white hover:text-gray-300 text-2xl font-bold"
                        >
                            ×
                        </button>
                        <Image
                            src={lightboxImage}
                            alt="Review image full size"
                            width={800}
                            height={800}
                            className="rounded-lg max-h-[85vh] w-auto object-contain"
                        />
                    </div>
                </div>
            )}

            {/* Verified Purchase Info Modal */}
            {showVerifiedInfo && (
                <div className="fixed inset-0 z-[70] bg-black/45 flex items-center justify-center p-4" onClick={() => setShowVerifiedInfo(false)}>
                    <div className="w-full max-w-[430px] rounded-md bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                            <button
                                onClick={() => setShowVerifiedInfo(false)}
                                className="-mt-2 -mr-2 h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </div>

                        <h3 className="mt-1 px-4 text-center text-[18px] sm:text-[20px] leading-[1.35] font-semibold text-green-700">
                            All reviews are from customers who have purchased this item.
                        </h3>

                        <div className="mt-4 space-y-4">
                            {[
                                'Customers purchase items on this store.',
                                'Customers will be able to leave a review directly from the order details page after delivery.',
                                'Only verified-purchase reviews are shown for this item.'
                            ].map((line) => (
                                <div key={line} className="flex items-start gap-3 text-[14px] leading-6 font-normal text-gray-800">
                                    <span className="mt-1 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-white text-[11px]">✓</span>
                                    <p>{line}</p>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => setShowVerifiedInfo(false)}
                            className="mt-6 w-full rounded-full bg-orange-500 py-3 text-lg font-semibold text-white hover:bg-orange-600 transition"
                        >
                            OK
                        </button>

                        <p className="mt-4 text-center text-[14px] text-gray-600">
                            To learn more, please refer to the Review Guidelines &gt;
                        </p>
                    </div>
                </div>
            )}

            {showAllReviewsModal && (
                <div className="fixed inset-0 z-[70] bg-black/45 flex items-center justify-center p-4" onClick={() => setShowAllReviewsModal(false)}>
                    <div className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                            <h3 className="text-lg font-semibold text-gray-900">{t('reviews.allReviewsTitle', { count: reviews.length })}</h3>
                            <button
                                onClick={() => setShowAllReviewsModal(false)}
                                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                aria-label="Close all reviews"
                            >
                                ×
                            </button>
                        </div>

                        <div className="overflow-y-auto max-h-[calc(85vh-70px)] px-5 py-4 space-y-7">
                            {reviews.map((item, idx) => renderReviewItem(item, idx, true))}
                        </div>
                    </div>
                </div>
            )}

            {showReportModal && (
                <div className="fixed inset-0 z-[200] bg-black/45 flex items-center justify-center p-4" onClick={() => setShowReportModal(false)}>
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">{t('product.reportItem')}</h3>
                            <button
                                type="button"
                                onClick={() => setShowReportModal(false)}
                                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                aria-label="Close report dialog"
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleSubmitReport} className="space-y-4">
                            <div>
                                <label htmlFor="report-reason" className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Reason
                                </label>
                                <select
                                    id="report-reason"
                                    value={reportReason}
                                    onChange={(event) => setReportReason(event.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                                >
                                    <option value="incorrect-information">Incorrect product information</option>
                                    <option value="counterfeit">Suspected counterfeit item</option>
                                    <option value="offensive">Offensive or inappropriate content</option>
                                    <option value="other">Other issue</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="report-details" className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Additional details (optional)
                                </label>
                                <textarea
                                    id="report-details"
                                    value={reportDetails}
                                    onChange={(event) => setReportDetails(event.target.value)}
                                    rows={4}
                                    placeholder="Tell us what is wrong with this listing..."
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowReportModal(false)}
                                    className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-lg bg-orange-500 text-sm font-semibold text-white hover:bg-orange-600"
                                >
                                    Continue to contact form
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
           
        </div>
    )
}

export default ProductDescription
