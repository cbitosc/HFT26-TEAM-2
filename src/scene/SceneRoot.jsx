/**
 * src/scene/SceneRoot.jsx
 * Top-level 3D viewport wrapper with WebGL error boundary fallback, CameraControls,
 * CameraDirector, view switching (galaxy / system / planet), and permanent honesty overlays.
 */

import { Component, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { CameraControls, Stars } from '@react-three/drei';
import { useExplorerStore } from '../store/explorerStore.js';
import { CameraDirector } from './cameraDirector.js';
import { GalaxyPoints } from './GalaxyPoints.jsx';
import { SystemView } from './SystemView.jsx';
import { PlanetView } from './PlanetView.jsx';

function detectWebGLSupport() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') ||
          canvas.getContext('webgl') ||
          canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

class SceneErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: null };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMsg: error instanceof Error ? error.message : String(error),
    };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback(this.state.errorMsg);
    }
    return this.props.children;
  }
}

export function SceneRoot() {
  const controlsRef = useRef(null);
  const viewLevel = useExplorerStore((s) => s.viewLevel);
  const selectedSystemId = useExplorerStore((s) => s.selectedSystemId);
  const snapshot = useExplorerStore((s) => s.snapshot);

  const webglAvailable = useMemo(() => detectWebGLSupport(), []);

  const selectedHost =
    snapshot && selectedSystemId ? snapshot.hostById.get(selectedSystemId) || null : null;

  const renderFallback = (reason) => (
    <div className="scene-webgl-fallback" role="region" aria-label="3D viewport fallback">
      <div className="fallback-card">
        <h3>3D Viewport Unavailable in Current Environment</h3>
        <p>
          WebGL rendering could not be initialised ({reason || 'WebGL context unavailable'}). All{' '}
          <strong>6,451 confirmed planets</strong> and <strong>4,847 host stars</strong> remain
          fully searchable and inspectable via the search bar and data panels.
        </p>
      </div>
    </div>
  );

  return (
    <div className="scene-viewport-container">
      {/* Permanent Honesty & Scale Badges per View Level */}
      <div className="scene-overlay-badges" aria-live="polite">
        {viewLevel === 'galaxy' && (
          <>
            <span className="scene-badge scene-badge-scale">
              Distances log-compressed for display — not to scale
            </span>
            <span className="scene-badge scene-badge-info">
              4,819 positioned host stars • 28 hosts without sky distance searchable above
            </span>
          </>
        )}

        {viewLevel === 'system' && (
          <>
            <span className="scene-badge scene-badge-impression">Artist&apos;s impression</span>
            <span className="scene-badge scene-badge-scale">
              Orbit spacing and sizes not to scale
            </span>
            {selectedHost && !selectedHost.hasPosition && (
              <span className="scene-badge scene-badge-warning">
                3D galactic position unknown in archive — showing local system diagram
              </span>
            )}
          </>
        )}

        {viewLevel === 'planet' && (
          <span className="scene-badge scene-badge-impression">
            Artist&apos;s impression — not to scale
          </span>
        )}
      </div>

      {!webglAvailable ? (
        renderFallback('WebGL not supported by browser/headless environment')
      ) : (
        <SceneErrorBoundary fallback={renderFallback}>
          <Canvas
            camera={{ position: [0, 42, 115], fov: 48, near: 0.1, far: 1200 }}
            raycaster={{ params: { Points: { threshold: 1.25 } } }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
          >
            <color attach="background" args={['#060811']} />
            <ambientLight intensity={0.55} />
            <Stars radius={320} depth={80} count={2400} factor={3} saturation={0} fade />

            <CameraControls
              ref={controlsRef}
              minDistance={2.2}
              maxDistance={320}
              dollySpeed={0.8}
            />
            <CameraDirector controlsRef={controlsRef} />

            {viewLevel === 'galaxy' && <GalaxyPoints />}
            {viewLevel === 'system' && <SystemView />}
            {viewLevel === 'planet' && <PlanetView />}
          </Canvas>
        </SceneErrorBoundary>
      )}
    </div>
  );
}

export default SceneRoot;
