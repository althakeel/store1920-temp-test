/**
 * Pick a distinct gallery card UI from template name / category / id.
 */
export function resolveGalleryUiStyle({ id = '', name = '', category = '' } = {}) {
  const key = `${id} ${name} ${category}`.toLowerCase();

  if (key.includes('blank') || key.includes('scratch')) return 'blank';
  if (key.includes('flash') || key.includes('clearance') || key.includes('mega weekend') || key.includes('weekend')) {
    return 'sale';
  }
  if (key.includes('welcome') || key.includes('brand story')) return 'welcome';
  if (key.includes('invite') || key.includes('party') || key.includes('workshop') || key.includes('open house')) {
    return 'invite';
  }
  if (key.includes('sms') || key.includes('grow sms')) return 'sms';
  if (key.includes('thank') || key.includes('vip thank') || key.includes('social proof') || key.includes('review')) {
    return 'thanks';
  }
  if (key.includes('order again') || key.includes('miss you') || key.includes('post-purchase') || key.includes('transactional')) {
    return 'txn';
  }
  if (key.includes('newsletter') || key.includes('lookbook') || key.includes('pairing') || key.includes('monthly') || key.includes('weekly')) {
    return 'editorial';
  }
  if (key.includes('styling') || key.includes('concierge') || key.includes('before') || key.includes('sell services')) {
    return 'service';
  }
  if (key.includes('uae')) return 'locale';
  if (key.includes('subscription') || key.includes('bundle')) return 'bundle';
  if (key.includes('back in stock') || key.includes('restock')) return 'restock';
  if (key.includes('drop') || key.includes('launch') || key.includes('spotlight') || key.includes('sell products')) {
    return 'product';
  }
  if (key.includes('announce')) return 'sale';

  return 'default';
}

export const GALLERY_UI_LABELS = {
  sale: 'Sale',
  welcome: 'Welcome',
  invite: 'Invite',
  sms: 'SMS',
  thanks: 'Thanks',
  txn: 'Reorder',
  editorial: 'Editorial',
  service: 'Service',
  locale: 'Local',
  bundle: 'Bundle',
  restock: 'Restock',
  product: 'Product',
  blank: 'Blank',
  default: 'Email',
};
