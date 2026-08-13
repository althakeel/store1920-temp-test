import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getProductPageData } from "@/lib/productPageData";
import { resolveStorefrontLanguage } from "@/lib/storefrontLanguage";
import { resolveProductPage } from "@/lib/productPageRoute";
import { resolveProductSlugRedirect } from "@/lib/productRedirects";
import ProductPageClient from "@/components/ProductPageClient";

export const revalidate = 120;

async function getStorefrontLanguage() {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  return resolveStorefrontLanguage({ cookies: cookieStore, headers: requestHeaders });
}

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const slug = String(resolvedParams?.slug || "").trim();
  if (!slug) return { title: "Product" };

  if (resolveProductSlugRedirect(slug)) {
    return { title: "Redirecting…" };
  }

  try {
    const language = await getStorefrontLanguage();
    const data = await getProductPageData(slug, language);
    const product = data?.product;

    if (!product) {
      return { title: "Product not found" };
    }

    const keywords = Array.isArray(product.seoKeywords) && product.seoKeywords.length > 0
      ? product.seoKeywords
      : (Array.isArray(product.tags) ? product.tags : []);

    return {
      title: String(product.seoTitle || product.name || "Product").trim(),
      description: String(product.seoDescription || product.shortDescription || "").trim(),
      keywords: keywords.length > 0 ? keywords.join(", ") : undefined,
    };
  } catch {
    return { title: "Product" };
  }
}

export default async function ProductsSlugProductPage({ params }) {
  const resolvedParams = await params;
  const slug = String(resolvedParams?.slug || "").trim();

  const slugRedirect = resolveProductSlugRedirect(slug);
  if (slugRedirect) {
    redirect(slugRedirect);
  }

  const language = await getStorefrontLanguage();
  const initialData = await resolveProductPage(slug, language, "products");

  return <ProductPageClient slug={slug} initialData={initialData} />;
}
