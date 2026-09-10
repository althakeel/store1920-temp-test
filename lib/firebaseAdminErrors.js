export function getFirebaseAdminUserMessage(error) {
  const message = String(error?.message || '');

  if (
    message.includes('invalid_grant') ||
    message.includes('Invalid JWT Signature') ||
    message.includes('Error fetching access token')
  ) {
    return 'The code is correct, but sign-in is blocked by an expired Firebase server key. Add a new firebase-service-account.json and restart the server.';
  }

  if (message.includes('Firebase Admin not initialized') || message.includes('service account')) {
    return 'Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT_KEY_PATH=./firebase-service-account.json to your .env file and restart the server.';
  }

  return message || 'Failed to complete Firebase Admin request.';
}
