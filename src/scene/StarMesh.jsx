/**
 * src/scene/StarMesh.jsx
 * Visual host star component:
 *   - Central stellar sphere colored by effective temperature (st_teff) or spectral type
 *   - Soft corona outer glow shell with additive blending
 *   - Omnidirectional pointLight illuminating orbiting planets
 *   - Optional HTML name and temperature badge
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { formatNumericValue } from '../data/fieldDictionary.js';

/**
 * Maps stellar effective temperature (Kelvin) to a physical star color.
 * Follows Harvard spectral sequence (O/B -> blue, A/F -> white, G -> yellow, K -> orange, M -> red).
 * Preserves missing/unknown temperatures as neutral slate white.
 *
 * @param {number|null|undefined} teff
 * @returns {string} Hex color string
 */
export function starColorFromTeff(teff) {
  if (typeof teff !== 'number' || !Number.isFinite(teff) || teff <= 0) {
    return '#cbd5e1';
  }
  if (teff < 3700) return '#ff6e4a'; // M-dwarf (red)
  if (teff < 5200) return '#ffb463'; // K-type (orange)
  if (teff < 6000) return '#fff1b8'; // G-type (yellow-white, Sun-like)
  if (teff < 7500) return '#f8fafc'; // F/A-type (white)
  return '#93c5fd'; // B/O-type (blue-white)
}

/**
 * Calculates display radius for host star, log-damped so giants don't occlude inner orbits.
 *
 * @param {number|null|undefined} stRad Solar radii
 * @returns {number} Scene radius
 */
export function starDisplayRadius(stRad) {
  if (typeof stRad !== 'number' || !Number.isFinite(stRad) || stRad <= 0) {
    return 1.15;
  }
  return Math.min(2.4, Math.max(0.65, 1.15 * Math.cbrt(stRad)));
}

export function StarMesh({
  name = 'Host Star',
  teff = null,
  stRad = null,
  showLabel = true,
  onClick = null,
}) {
  const starColor = useMemo(() => starColorFromTeff(teff), [teff]);
  const radius = useMemo(() => starDisplayRadius(stRad), [stRad]);

  return (
    <group name="star-mesh-root" position={[0, 0, 0]}>
      {/* Central Star Core */}
      <mesh
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick();
          }
        }}
      >
        <sphereGeometry args={[radius, 36, 36]} />
        <meshBasicMaterial color={starColor} />
      </mesh>

      {/* Soft Corona Outer Glow */}
      <mesh scale={[1.18, 1.18, 1.18]}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshBasicMaterial
          color={starColor}
          transparent
          opacity={0.22}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Illuminating Point Light */}
      <pointLight position={[0, 0, 0]} intensity={2.8} distance={90} decay={2} color={starColor} />

      {/* HTML Star Badge */}
      {showLabel && (
        <Html position={[0, -radius - 0.55, 0]} center distanceFactor={28}>
          <div
            className="scene-star-badge"
            onClick={onClick ? () => onClick() : undefined}
            role={onClick ? 'button' : undefined}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
          >
            <strong>{name}</strong>
            {teff !== null && Number.isFinite(teff)
              ? ` (${formatNumericValue(teff)} K)`
              : ' (Teff unknown)'}
          </div>
        </Html>
      )}
    </group>
  );
}

export default StarMesh;

