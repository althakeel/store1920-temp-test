'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/lib/useAuth'
import { linkGuestOrdersForCurrentUser } from '@/lib/linkGuestOrdersClient'
import { showStorefrontActionToast } from '@/lib/storefrontActionToast'
import { useStorefrontI18n } from '@/lib/useStorefrontI18n'

export default function GuestOrderLinker() {
    const { user, loading, getToken } = useAuth()
    const { t } = useStorefrontI18n()
    const isSignedIn = !!user
    const linkingRef = useRef(false)
    const lastAttemptRef = useRef({ uid: null, at: 0 })

    useEffect(() => {
        let active = true

        const linkGuestOrders = async () => {
            if (loading || !isSignedIn || !user?.uid) return

            const now = Date.now()
            const lastAttempt = lastAttemptRef.current
            const recentlyAttempted = lastAttempt.uid === user.uid && now - lastAttempt.at < 15000
            if (recentlyAttempted || linkingRef.current) return

            try {
                const token = await getToken()
                if (!token || !active) return

                linkingRef.current = true
                lastAttemptRef.current = { uid: user.uid, at: now }

                const data = await linkGuestOrdersForCurrentUser(user, token)

                if (!active) return

                if (data?.linked && data.count > 0) {
                    const count = Number(data.count) || 0
                    showStorefrontActionToast({
                        variant: 'orders',
                        title: t('account.ordersLinkedTitle'),
                        subtitle: t('account.ordersLinkedSubtitle').replace('{count}', String(count)),
                        actionLabel: t('account.viewOrders'),
                        actionHref: '/dashboard/orders',
                        duration: 6000,
                        position: 'bottom-center',
                    })
                }
            } catch (error) {
                if (process.env.NODE_ENV !== 'production') {
                    console.warn('Failed to link guest orders:', error)
                }
            } finally {
                linkingRef.current = false
            }
        }

        const timer = setTimeout(linkGuestOrders, 300)
        const retryTimer = setTimeout(linkGuestOrders, 2500)

        return () => {
            active = false
            clearTimeout(timer)
            clearTimeout(retryTimer)
            linkingRef.current = false
        }
    }, [isSignedIn, user, getToken, loading, t])

    return null
}
