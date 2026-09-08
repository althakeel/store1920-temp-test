'use client';

import { Component } from 'react';
import { isDomReconcileError } from '@/lib/domReconcileError';

/**
 * Recovers from browser DOM races (GTM, language/dir flip, extensions)
 * without showing the public error screen.
 * Do not use display:contents — that wrapper itself can trigger removeChild.
 */
export default class SilentDomErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { generation: 0 };
  }

  static getDerivedStateFromError(error) {
    if (isDomReconcileError(error)) {
      return { generation: Date.now() };
    }
    return null;
  }

  componentDidCatch(error) {
    if (isDomReconcileError(error)) return;
    console.error('[SilentDomErrorBoundary]', error);
  }

  render() {
    return (
      <div key={this.state.generation} className="min-w-0">
        {this.props.children}
      </div>
    );
  }
}
