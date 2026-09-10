'use client'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import React from 'react'
import { useStorefrontI18n } from '@/lib/useStorefrontI18n'
import { getContentDirection } from '@/lib/storefrontLanguage'

const Title = ({ title, description, visibleButton = true, href = '' }) => {
    const { t } = useStorefrontI18n()
    const linkHref = String(href || '').trim()
    const descriptionBlock = (
        <>
            <p className='max-w-lg text-center'>
                <bdi dir={getContentDirection(description)}>{description}</bdi>
            </p>
            {visibleButton && <button className='text-green-500 flex items-center gap-1'>{t('common.viewMore')} <ArrowRight size={14} /></button>}
        </>
    )

    return (
        <div className='flex flex-col items-center'>
            <h2 className='text-2xl font-semibold text-slate-800'>
                <bdi dir={getContentDirection(title)}>{title}</bdi>
            </h2>
            {linkHref ? (
                <Link href={linkHref} className='flex items-center gap-5 text-sm text-slate-600 mt-2'>
                    {descriptionBlock}
                </Link>
            ) : (
                <div className='flex items-center gap-5 text-sm text-slate-600 mt-2'>
                    {descriptionBlock}
                </div>
            )}
        </div>
    )
}

export default Title