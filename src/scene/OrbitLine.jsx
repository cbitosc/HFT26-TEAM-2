/**
 * src/scene/OrbitLine.jsx
 * Renders orbital paths in the star system:
 *   - Continuous solid lines for known orbits (with optional eccentricity)
 *   - Dashed lines for planets missing semi-major axis or limit-bound
 *   - Geometry generation helpers exported for testing
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';

/**
 * Computes vertices along an orbital path in the XZ plane.
 * When eccentricity is known and significant (0.05 <= e < 0.95), generates an ellipse
 * with the star at one focus (shifted by r * e along the major axis).
 *
 * @param {number} radius Semi-major axis in scene units
 * @param {number} [eccentricity=0] Orbital eccentricity
 * @param {number} [segments=96] Number of subdivision points
 * @returns {THREE.Vector3[]} Array of 3D points
 */
export function generateOrbitPoints(radius, eccentricity = 0, segments = 96) {
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0) {
    return [];
  }

  const e =
    typeof eccentricity === 'number' && Number.isFinite(eccentricity) && eccentricity >= 0.05 && eccentricity < 0.95
      ? eccentricity
      : 0;

  const pts = [];
  const semiMinor = radius * Math.sqrt(Math.max(0.01, 1 - e * e));
  const focusOffset = radius * e;

  for (let i = 0; i <= segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    const x = Math.cos(theta) * radius - focusOffset;
    const z = Math.sin(theta) * semiMinor;
    pts.push(new THREE.Vector3(x, 0, z));
  }

  return pts;
}

export function OrbitLine({
  radius,
  eccentricity = 0,
  isUnknown = false,
  color = null,
  lineWidth = 1,
  dashSize = 0.45,
  gapSize = 0.35,
  segments = 96,
}) {
  const points = useMemo(
    () => generateOrbitPoints(radius, eccentricity, segments),
    [radius, eccentricity, segments]
  );

  const defaultColor = isUnknown ? '#64748b' : '#334155';
  const lineColor = color || defaultColor;

  if (points.length === 0) return null;

  return (
    <Line
      points={points}
      color={lineColor}
      lineWidth={lineWidth}
      dashed={isUnknown}
      dashSize={dashSize}
      gapSize={gapSize}
    />
  );
}

export default OrbitLine;

