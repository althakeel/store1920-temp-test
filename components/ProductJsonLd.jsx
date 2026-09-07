import { buildProductSeoJsonLdDocuments, safeJsonLd } from '@/lib/productSeo';

export default function ProductJsonLd({ product, reviews = [], categoryChain = [] }) {
  const documents = buildProductSeoJsonLdDocuments({
    product,
    reviews,
    categoryChain: categoryChain.length ? categoryChain : product?.categoryChain,
  });

  if (!documents.length) return null;

  return (
    <>
      {documents.map((document, index) => (
        <script
          key={`${document['@type']}-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(document) }}
        />
      ))}
    </>
  );
}
