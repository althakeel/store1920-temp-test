export function isWhatsAppAlreadySentError(message = '') {
  const text = String(message || '').toLowerCase();
  return text.includes('nothing to update')
    || text.includes('already sent')
    || text.includes('duplicate')
    || text.includes('already queued')
    || text.includes('sorry nothing');
}

export function isWhatsAppMediaError(message = '') {
  const text = String(message || '').toLowerCase();
  return text.includes('header')
    || text.includes('image')
    || text.includes('media')
    || text.includes('unable to download')
    || text.includes('could not download')
    || text.includes('invalid parameter')
    || text.includes('132012')
    || text.includes('132001')
    || text.includes('132005');
}

export function extractElasticResponseMessages(data = {}) {
  const values = [];
  const push = (value) => {
    const text = String(value ?? '').trim();
    if (!text || text === 'null' || text === 'undefined') return;
    values.push(text);
  };

  push(data?.message);
  if (typeof data?.error === 'string') {
    push(data.error);
  } else if (data?.error && typeof data.error === 'object') {
    push(data.error.message);
    push(data.error.error_user_msg);
    push(data.error.error_user_title);
  }
  push(data?.status_message);
  push(data?.statusMessage);
  push(data?.detail);
  push(data?.description);

  if (Array.isArray(data?.messages)) {
    data.messages.forEach((entry) => {
      if (typeof entry === 'string') push(entry);
      else if (entry && typeof entry === 'object') push(entry.message || entry.error);
    });
  }

  return values;
}

export function classifyElasticWabaResponse(data = {}, response = {}) {
  const messages = extractElasticResponseMessages(data);
  const combined = messages.join(' ');
  const duplicate = messages.some((message) => isWhatsAppAlreadySentError(message))
    || isWhatsAppAlreadySentError(combined)
    || (/^error[,\s]/i.test(combined) && isWhatsAppAlreadySentError(combined));

  if (duplicate) {
    return {
      kind: 'duplicate',
      message: messages[0] || combined || 'Duplicate WhatsApp send',
      raw: combined || messages[0] || '',
    };
  }

  if (!response?.ok) {
    const message = messages[0] || response?.statusText || 'WhatsApp API request failed';
    return {
      kind: 'error',
      message,
      raw: message,
    };
  }

  if (messages.some((message) => /^error[,\s]/i.test(message))) {
    return {
      kind: 'error',
      message: messages[0],
      raw: messages[0],
    };
  }

  return { kind: 'success' };
}

export function formatWhatsAppErrorMessage(error) {
  if (!error) return 'WhatsApp could not be sent';

  if (typeof error === 'object') {
    const nested = error.message || error.error || error.detail || error.description;
    if (nested && nested !== error) {
      return formatWhatsAppErrorMessage(nested);
    }
    try {
      return formatWhatsAppErrorMessage(JSON.stringify(error));
    } catch {
      return 'WhatsApp could not be sent';
    }
  }

  let text = String(error).trim();
  if (!text || text === 'null' || text === 'undefined') {
    return 'WhatsApp could not be sent';
  }

  text = text.replace(/^Error,\s*null,\s*/i, '').trim();

  if (isWhatsAppAlreadySentError(text)) {
    return 'WhatsApp reminder was already sent to this customer recently.';
  }

  return text;
}

export function parseWhatsAppApiError(data = {}, response = {}) {
  const classified = classifyElasticWabaResponse(data, response);
  const message = classified.raw || classified.message || 'WhatsApp API request failed';
  const friendly = formatWhatsAppErrorMessage(message);

  return {
    message: friendly,
    duplicate: classified.kind === 'duplicate' || isWhatsAppAlreadySentError(message) || isWhatsAppAlreadySentError(friendly),
    raw: message,
  };
}
