/**
 * src/scene/AtmosphereGlow.jsx
 * Fresnel-like atmospheric glow shell:
 *   - Uses an inverted back-face sphere shell with additive blending
 *   - Perfectly stable across all WebGL hardware without custom shader compile hazards
 *   - Color matched to FORGE-lite atmospheric profile (azure, cyan, gold, magma vapor, pale frost)
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { PLANET_CLASS_META } from '../data/fieldDictionary.js';

/**
 * Returns atmospheric color and opacity for a planet classification.
 *
 * @param {string} planetClass
 * @returns {{ color: string, opacity: number, scale: number }}
 */
export function getAtmosphereConfig(planetClass) {
  const meta = PLANET_CLASS_META[planetClass] || PLANET_CLASS_META.unclassified;

  switch (planetClass) {
    case 'rocky':
      return {
        color: meta.atmosphere,
        opacity: 0.16,
        scale: 1.055,
      };
    case 'sub_neptune':
      return {
        color: meta.atmosphere,
        opacity: 0.22,
        scale: 1.075,
      };
    case 'gas_giant':
      return {
        color: meta.atmosphere,
        opacity: 0.25,
        scale: 1.085,
      };
    case 'hot_lava':
      return {
        color: meta.atmosphere,
        opacity: 0.28, // Fiery volcanic haze
        scale: 1.06,
      };
    case 'icy':
      return {
        color: meta.atmosphere,
        opacity: 0.14, // Thin cryogenic haze
        scale: 1.045,
      };
    case 'unclassified':
    default:
      return {
        color: meta.atmosphere,
        opacity: 0.08,
        scale: 1.04,
      };
  }
}

export function AtmosphereGlow({
  planetClass = 'unclassified',
  radius = 1.0,
  scale = null,
  color = null,
  opacity = null,
}) {
  const config = useMemo(() => getAtmosphereConfig(planetClass), [planetClass]);

  const glowColor = color || config.color;
  const glowOpacity = opacity !== null ? opacity : config.opacity;
  const glowScale = scale !== null ? scale : config.scale;

  return (
    <mesh scale={[glowScale, glowScale, glowScale]}>
      <sphereGeometry args={[radius, 40, 40]} />
      <meshBasicMaterial
        color={glowColor}
        transparent
        opacity={glowOpacity}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

export default AtmosphereGlow;

