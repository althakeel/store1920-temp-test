'use client';

import { Component } from 'react';
import { isDomReconcileError } from '@/lib/domReconcileError';

/**
 * Swallows browser DOM races (GTM, language/dir flip, Recharts, extensions)
 * without remounting the tree. Remounting with a new key caused more removeChild.
 */
export default class SilentDomErrorBoundary extends Component {
  static getDerivedStateFromError(error) {
    if (isDomReconcileError(error)) {
      return { swallowed: true };
    }
    return null;
  }

  componentDidCatch(error) {
    if (isDomReconcileError(error)) return;
    console.error('[SilentDomErrorBoundary]', error);
  }

  render() {
    return (
      <div className={this.props.className || 'min-w-0'}>
        {this.props.children}
      </div>
    );
  }
}
