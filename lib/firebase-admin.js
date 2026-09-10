// lib/firebase-admin.js
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth as adminGetAuth } from 'firebase-admin/auth'
import {
  getFirebaseServiceAccountDiagnostics,
  loadFirebaseServiceAccount,
} from '@/lib/loadFirebaseServiceAccount'

const expectedProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
const isProductionBuildCollect =
  process.env.NEXT_PHASE === 'phase-production-build'
  || process.env.NEXT_PHASE === 'phase-production-compile'

let serviceAccount
let initError = ''

try {
  serviceAccount = loadFirebaseServiceAccount()

  if (serviceAccount) {
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error('Service account is missing required fields (project_id, private_key, or client_email)')
    }

    if (expectedProjectId && serviceAccount.project_id !== expectedProjectId) {
      throw new Error(
        `Firebase Admin project mismatch. Expected ${expectedProjectId} but got ${serviceAccount.project_id}`
      )
    }
  } else if (!isProductionBuildCollect) {
    console.warn('Firebase service account is missing. Set FIREBASE_SERVICE_ACCOUNT_KEY_PATH or FIREBASE_SERVICE_ACCOUNT_KEY.')
  }
} catch (error) {
  initError = error.message
  serviceAccount = null
  if (!isProductionBuildCollect) {
    console.error('Firebase service account load error:', initError)
  }
}

if (serviceAccount && !initError && !getApps().length) {
  try {
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      process.env.GOOGLE_CLOUD_PROJECT = serviceAccount.project_id
    }
    if (!process.env.GCLOUD_PROJECT) {
      process.env.GCLOUD_PROJECT = serviceAccount.project_id
    }
    if (!process.env.FIREBASE_CONFIG) {
      process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: serviceAccount.project_id })
    }

    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    })
  } catch (error) {
    initError = error.message
    console.error('Firebase Admin initialization failed:', initError)
    if (process.env.NODE_ENV === 'development') {
      throw error
    }
  }
} else if (!getApps().length && !isProductionBuildCollect) {
  console.warn('Firebase Admin not initialized - service account credentials not available')
}

export const getAuth = () => {
  if (initError && !getApps().length) {
    throw new Error(initError)
  }

  try {
    if ((!process.env.GCLOUD_PROJECT || !process.env.GOOGLE_CLOUD_PROJECT) && serviceAccount?.project_id) {
      if (!process.env.GCLOUD_PROJECT) process.env.GCLOUD_PROJECT = serviceAccount.project_id
      if (!process.env.GOOGLE_CLOUD_PROJECT) process.env.GOOGLE_CLOUD_PROJECT = serviceAccount.project_id
      if (!process.env.FIREBASE_CONFIG) {
        process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: serviceAccount.project_id })
      }
    }

    return adminGetAuth()
  } catch (error) {
    throw new Error('Firebase Admin not initialized. Set FIREBASE_SERVICE_ACCOUNT_KEY_PATH or FIREBASE_SERVICE_ACCOUNT_KEY.')
  }
}

export { getFirebaseServiceAccountDiagnostics }
