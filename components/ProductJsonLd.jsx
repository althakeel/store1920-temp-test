import { getProductSlug } from '@/lib/productUrl';
import { buildProductSeoJsonLdDocuments, safeJsonLd } from '@/lib/productSeo';

export default function ProductJsonLd({ product, reviews = [], categoryChain = [] }) {
  const documents = buildProductSeoJsonLdDocuments({
    product,
    reviews,
    categoryChain: categoryChain.length ? categoryChain : product?.categoryChain,
  });

  if (!documents.length) return null;

  const slug = getProductSlug(product) || 'product';

  return (
    <>
      {documents.map((document) => {
        const type = String(document?.['@type'] || 'schema').toLowerCase();
        return (
          <script
            key={`jsonld-${type}-${slug}`}
            id={`jsonld-${type}-${slug}`}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: safeJsonLd(document) }}
          />
        );
      })}
    </>
  );
}
