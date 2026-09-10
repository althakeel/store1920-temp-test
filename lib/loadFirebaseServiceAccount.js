import fs from 'fs'
import path from 'path'

function normalizePrivateKey(serviceAccount) {
  if (!serviceAccount || typeof serviceAccount.private_key !== 'string') {
    return serviceAccount
  }

  let key = serviceAccount.private_key
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '')
    .trim()

  if (key.includes('BEGIN') && !key.includes('\n')) {
    key = key
      .replace(/-----BEGIN ([A-Z ]+)-----/, '-----BEGIN $1-----\n')
      .replace(/-----END ([A-Z ]+)-----/, '\n-----END $1-----\n')
  }

  if (!key.endsWith('\n')) key += '\n'
  serviceAccount.private_key = key
  return serviceAccount
}

function parseServiceAccountJson(rawValue = '') {
  let value = String(rawValue || '').trim()

  if (!value) {
    throw new Error('Firebase service account value is empty.')
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  const parsed = JSON.parse(value)
  return normalizePrivateKey(parsed)
}

function readServiceAccountFromFile(filePath = '') {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath)

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Firebase service account file was not found at ${resolvedPath}`)
  }

  const fileContents = fs.readFileSync(resolvedPath, 'utf8')
  return parseServiceAccountJson(fileContents)
}

function resolveServiceAccountFilePath(filePath = '') {
  if (!filePath) return ''
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
}

export function loadFirebaseServiceAccount() {
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH?.trim()
  const inlineKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()
  const resolvedPath = resolveServiceAccountFilePath(filePath)

  // Local file wins when it exists. On Vercel the JSON file is not deployed, so
  // a leftover FIREBASE_SERVICE_ACCOUNT_KEY_PATH must fall back to the env JSON.
  if (resolvedPath && fs.existsSync(resolvedPath)) {
    return readServiceAccountFromFile(resolvedPath)
  }

  if (inlineKey) {
    return parseServiceAccountJson(inlineKey)
  }

  if (filePath && !inlineKey) {
    throw new Error(`Firebase service account file was not found at ${resolvedPath}`)
  }

  return null
}

export function getFirebaseServiceAccountDiagnostics() {
  const expectedProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || ''
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH?.trim() || ''
  const inlineKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim() || ''

  const diagnostics = {
    hasInlineKey: Boolean(inlineKey),
    hasKeyFilePath: Boolean(filePath),
    expectedProjectId,
    source: (filePath && fs.existsSync(resolveServiceAccountFilePath(filePath)))
      ? 'file'
      : inlineKey
        ? 'env'
        : 'missing',
    parseOk: false,
    serviceAccountProjectId: '',
    clientEmailDomain: '',
    privateKeyLooksValid: false,
    projectMatch: false,
    error: '',
  }

  try {
    const serviceAccount = loadFirebaseServiceAccount()
    if (!serviceAccount) {
      diagnostics.error = 'No Firebase service account configured.'
      return diagnostics
    }

    diagnostics.parseOk = true
    diagnostics.serviceAccountProjectId = serviceAccount.project_id || ''
    diagnostics.clientEmailDomain = String(serviceAccount.client_email || '').split('@')[1] || ''
    diagnostics.privateKeyLooksValid = String(serviceAccount.private_key || '').includes('BEGIN PRIVATE KEY')
    diagnostics.projectMatch =
      !expectedProjectId || diagnostics.serviceAccountProjectId === expectedProjectId

    if (!diagnostics.privateKeyLooksValid) {
      diagnostics.error = 'Service account private_key is missing or malformed.'
    } else if (!diagnostics.projectMatch) {
      diagnostics.error = 'Service account project_id does not match NEXT_PUBLIC_FIREBASE_PROJECT_ID.'
    }
  } catch (error) {
    diagnostics.error = error.message || 'Failed to load Firebase service account.'
  }

  return diagnostics
}
