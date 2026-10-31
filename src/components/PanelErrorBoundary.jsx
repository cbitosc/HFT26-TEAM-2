/**
 * src/components/PanelErrorBoundary.jsx
 * Resilient Error Boundary for HUD overlays, drawers, and inspection panels.
 * Prevents isolated UI panel errors from unmounting the primary scene or blanking the page.
 */

import React, { Component } from 'react';

export class PanelErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[PanelErrorBoundary: ${this.props.panelName || 'HUD Panel'}]`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.handleReset);
      }
      return (
        <div
          className="panel-error-fallback"
          role="alert"
          style={{
            padding: '12px 16px',
            margin: '8px',
            background: 'rgba(30, 27, 46, 0.95)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '8px',
            color: '#f87171',
            fontSize: '12px',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            {this.props.panelName || 'Panel'} Error
          </div>
          <div style={{ color: '#cbd5e1', fontSize: '11px', marginBottom: '8px' }}>
            {this.state.error?.message || 'An unexpected rendering error occurred in this panel.'}
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '4px',
              color: '#fca5a5',
              cursor: 'pointer',
            }}
          >
            Reset Panel
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default PanelErrorBoundary;

