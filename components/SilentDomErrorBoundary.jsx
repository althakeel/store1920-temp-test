'use client';

import { Component } from 'react';

function isDomReconcileError(error) {
  return /removeChild|insertBefore|not a child of this node|The node before which/i.test(
    String(error?.message || ''),
  );
}

/**
 * Recovers from browser DOM races (language/dir flip, extensions)
 * without showing the public error screen.
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

  render() {
    return (
      <div key={this.state.generation} className="contents">
        {this.props.children}
      </div>
    );
  }
}
