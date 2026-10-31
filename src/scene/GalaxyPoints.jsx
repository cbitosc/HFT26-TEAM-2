/**
 * src/scene/GalaxyPoints.jsx
 * Renders all positioned host stars in a single THREE.Points draw call.
 * Dynamically filters visible host stars by `timelineYear` (1992–2026),
 * enabling users and HELM to explore discoveries unfolding over time.
 * Points are colored by primary detection method to visualize detection bias.
 */

import { useEffect, useMemo, useState } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useExplorerStore, selectVisibleGalaxyHosts } from '../store/explorerStore.js';
import { formatNumericValue } from '../data/fieldDictionary.js';

/**
 * Standard palette for exoplanet detection methods.
 * Visually communicates observational bias (e.g. Kepler transit cone vs RV solar neighborhood).
 */
export const METHOD_COLORS = Object.freeze({
  Transit: '#38bdf8', // Cyan / Kepler sky-blue
  'Radial Velocity': '#fb923c', // Warm orange / Doppler shift
  Microlensing: '#c084fc', // Purple / Gravitational lens
  Imaging: '#34d399', // Emerald / Direct photon imaging
  default: '#94a3b8', // Muted slate for timing, astrometry & secondary methods
  highlight: '#ffcf4a', // Bright gold for active searches or HELM selections
});

/**
 * Resolves the display color for a host star point.
 *
 * @param {object} host Host record from galaxy.json
 * @param {boolean} [isHighlighted=false]
 * @returns {string} Hex color
 */
export function getHostDotColor(host, isHighlighted = false) {
  if (isHighlighted) {
    return METHOD_COLORS.highlight;
  }
  const method = host?.primaryMethod;
  if (method && METHOD_COLORS[method]) {
    return METHOD_COLORS[method];
  }
  return METHOD_COLORS.default;
}

function createStarSpriteTexture() {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(220, 238, 255, 0.85)');
  grad.addColorStop(0.7, 'rgba(130, 180, 255, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function GalaxyPoints() {
  const snapshot = useExplorerStore((s) => s.snapshot);
  const timelineYear = useExplorerStore((s) => s.timelineYear);
  const highlightIds = useExplorerStore((s) => s.highlightIds);
  const selectSystem = useExplorerStore((s) => s.selectSystem);
  const setHoverId = useExplorerStore((s) => s.setHoverId);

  const [hoveredHost, setHoveredHost] = useState(null);

  const spriteTexture = useMemo(() => createStarSpriteTexture(), []);

  // Filter strictly to hosts discovered on or before the selected timelineYear
  const positionedHosts = useMemo(() => {
    return selectVisibleGalaxyHosts(snapshot, timelineYear);
  }, [snapshot, timelineYear]);

  // When timeline moves backwards, dismiss hover state if the hovered host is hidden
  useEffect(() => {
    if (
      hoveredHost &&
      typeof hoveredHost.firstDiscYear === 'number' &&
      hoveredHost.firstDiscYear > timelineYear
    ) {
      setHoveredHost(null);
      setHoverId(null);
    }
  }, [timelineYear, hoveredHost, setHoverId]);

  const highlightSet = useMemo(() => new Set(highlightIds || []), [highlightIds]);

  const geometry = useMemo(() => {
    const count = positionedHosts.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < count; i += 1) {
      const h = positionedHosts[i];
      positions[i * 3] = h.posDisplay.x;
      positions[i * 3 + 1] = h.posDisplay.y;
      positions[i * 3 + 2] = h.posDisplay.z;

      const isHighlighted =
        highlightSet.size > 0 &&
        (highlightSet.has(h.systemId) || h.planetIds.some((pid) => highlightSet.has(pid)));

      const hex = getHostDotColor(h, isHighlighted);
      color.set(hex);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeBoundingSphere();
    return geom;
  }, [positionedHosts, highlightSet]);

  return (
    <group name="galaxy-points-root">
      {/* Sun / Solar System Origin Marker at [0, 0, 0] */}
      <group position={[0, 0, 0]}>
        <mesh>
          <sphereGeometry args={[0.75, 20, 20]} />
          <meshBasicMaterial color="#fde047" />
        </mesh>
        <Html position={[0, 1.4, 0]} center distanceFactor={65}>
          <div className="scene-origin-badge" title="Solar System reference origin [0, 0, 0] pc">
            ☉ Sun (Origin)
          </div>
        </Html>
      </group>

      {/* Single draw call THREE.Points for positioned host stars filtered by timelineYear */}
      <points
        geometry={geometry}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (typeof e.index === 'number' && positionedHosts[e.index]) {
            const host = positionedHosts[e.index];
            setHoveredHost(host);
            setHoverId(host.systemId);
          }
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHoveredHost(null);
          setHoverId(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (typeof e.index === 'number' && positionedHosts[e.index]) {
            selectSystem(positionedHosts[e.index].systemId);
          }
        }}
      >
        <pointsMaterial
          size={1.65}
          sizeAttenuation
          vertexColors
          transparent
          opacity={0.92}
          depthWrite={false}
          map={spriteTexture || null}
        />
      </points>

      {/* Hover highlight ring & tooltip */}
      {hoveredHost && hoveredHost.posDisplay && (
        <group
          position={[
            hoveredHost.posDisplay.x,
            hoveredHost.posDisplay.y,
            hoveredHost.posDisplay.z,
          ]}
        >
          <mesh>
            <ringGeometry args={[0.9, 1.35, 24]} />
            <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} />
          </mesh>
          <Html position={[0, 1.8, 0]} center>
            <div className="scene-hover-tooltip">
              <div className="tooltip-title">{hoveredHost.hostname}</div>
              <div className="tooltip-meta">
                {hoveredHost.planetCount}{' '}
                {hoveredHost.planetCount === 1 ? 'planet' : 'planets'}
                {hoveredHost.firstDiscYear ? ` • Discovered ${hoveredHost.firstDiscYear}` : ''}
                {hoveredHost.primaryMethod ? ` (${hoveredHost.primaryMethod})` : ''}
                {hoveredHost.syDistPc !== null
                  ? ` • ${formatNumericValue(hoveredHost.syDistPc)} pc`
                  : ''}
              </div>
              {hoveredHost.hasHzPlanet && (
                <div className="tooltip-hz-tag">Includes HZ-band planet</div>
              )}
              <div className="tooltip-hint">Click to inspect system</div>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

export default GalaxyPoints;
