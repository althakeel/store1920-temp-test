'use client'

import { useSelector } from 'react-redux'
import { useState } from 'react'
import ProductCard from '@/components/ProductCard'
import Title from './Title'
import { HOME_PRODUCT_GRID_CLASS } from '@/lib/storefrontCarousel'

const BestSelling = () => {
  const displayQuantity = 16
  const products = useSelector((state) => state.product.list || [])
  const [curated] = useState([])

  const baseSorted = products
    .slice()
    .sort((a, b) => (b.rating?.length || b.ratingCount || 0) - (a.rating?.length || a.ratingCount || 0))
    .slice(0, displayQuantity)

  const shown = (curated.length ? curated : baseSorted).slice(0, displayQuantity)

  if (!shown.length) return null

  return (
    <div className="mx-auto my-16 w-full max-w-[1250px] px-4">
      <Title
        title="Fast Selling Products"
        description="Grab the best deals before they're gone!"
        href="/offers"
        visibleButton={false}
      />

      <div className={HOME_PRODUCT_GRID_CLASS}>
        {shown.map((product, index) => (
          <ProductCard key={product._id} product={product} priorityImages={index < 6} />
        ))}
      </div>
    </div>
  )
}

export default BestSelling
