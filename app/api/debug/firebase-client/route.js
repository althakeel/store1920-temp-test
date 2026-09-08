import { NextResponse } from 'next/server'
import { getFirebaseClientDiagnostics } from '@/lib/firebaseClientSetup'
import { getAuth, getFirebaseServiceAccountDiagnostics } from '@/lib/firebase-admin'
import { getFirebaseAdminUserMessage } from '@/lib/firebaseAdminErrors'

export const runtime = 'nodejs'

export async function GET() {
  const client = getFirebaseClientDiagnostics()
  const admin = getFirebaseServiceAccountDiagnostics()

  let adminOk = false
  let adminError = ''

  if (admin.parseOk && !admin.error) {
    try {
      await getAuth().listUsers(1)
      adminOk = true
    } catch (error) {
      adminError = getFirebaseAdminUserMessage(error)
    }
  } else {
    adminError = admin.error || 'Firebase Admin service account is not configured.'
  }

  return NextResponse.json({
    success: adminOk && Boolean(client.projectId) && Boolean(client.authDomain),
    client,
    admin: {
      ...admin,
      ok: adminOk,
      error: adminError || admin.error || null,
    },
    fixSteps: [
      'Open Firebase Console → Authentication → Settings → Authorized domains.',
      'Add store1920.com, www.store1920.com, and localhost if missing.',
      'Keep NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN as store1920-7d673.firebaseapp.com (do not use store1920.com here).',
      'Set NEXT_PUBLIC_APP_URL=https://www.store1920.com in production env (Vercel/hosting).',
    ],
  })
}
