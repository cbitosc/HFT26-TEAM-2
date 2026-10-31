/**
 * src/scene/GalaxyPoints.jsx
 * Renders all positioned host stars (4,819 hosts with valid RA/Dec/sy_dist)
 * in a single THREE.Points draw call using BufferGeometry.
 * Never fabricates 3D coordinates for the 28 unpositioned hosts.
 */

import { useMemo, useState } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useExplorerStore } from '../store/explorerStore.js';
import { formatNumericValue } from '../data/fieldDictionary.js';

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
  const highlightIds = useExplorerStore((s) => s.highlightIds);
  const selectSystem = useExplorerStore((s) => s.selectSystem);
  const setHoverId = useExplorerStore((s) => s.setHoverId);

  const [hoveredHost, setHoveredHost] = useState(null);

  const spriteTexture = useMemo(() => createStarSpriteTexture(), []);

  // Filter strictly to hosts with real 3D positions (never invent coordinates)
  const positionedHosts = useMemo(() => {
    if (!snapshot?.galaxy) return [];
    return snapshot.galaxy.filter(
      (h) =>
        h.hasPosition === true &&
        h.posDisplay !== null &&
        Number.isFinite(h.posDisplay.x) &&
        Number.isFinite(h.posDisplay.y) &&
        Number.isFinite(h.posDisplay.z)
    );
  }, [snapshot]);

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

      if (isHighlighted) {
        color.set('#ffcf4a');
      } else if (h.hasHzPlanet) {
        color.set('#5eead4');
      } else if (h.planetCount >= 3) {
        color.set('#93c5fd');
      } else {
        color.set('#cbd5e1');
      }

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

      {/* Single draw call THREE.Points for all 4,819 positioned host stars */}
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
