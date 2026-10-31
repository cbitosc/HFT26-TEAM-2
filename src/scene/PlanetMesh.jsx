/**
 * src/scene/PlanetMesh.jsx
 * Procedural planet mesh styled according to FORGE-lite visual classification:
 *   - Rocky: Ochre/terracotta high-roughness terrestrial sphere
 *   - Sub-Neptune: Cyan/azure smooth volatile-rich atmosphere
 *   - Gas Giant: Warm amber banded sphere with optional Saturnian ring geometry
 *   - Hot/Lava: Volcanic vermilion with high incandescent emissive glow
 *   - Icy: Specular pale cyan/white high-albedo frost world
 *   - Unclassified: Honest slate-grey sphere indicating missing data
 */

import { forwardRef, useMemo } from 'react';
import * as THREE from 'three';
import { PLANET_CLASS_META } from '../data/fieldDictionary.js';

/**
 * Returns material properties tailored to the FORGE-lite planet classification.
 *
 * @param {string} planetClass
 * @param {boolean} [isSelected=false]
 * @returns {object} Material properties
 */
export function getPlanetMaterialConfig(planetClass, isSelected = false) {
  const meta = PLANET_CLASS_META[planetClass] || PLANET_CLASS_META.unclassified;

  let roughness = 0.55;
  let metalness = 0.05;
  let emissive = meta.emissive;
  let emissiveIntensity = 1.0;

  switch (planetClass) {
    case 'rocky':
      roughness = 0.74;
      metalness = 0.05;
      break;
    case 'sub_neptune':
      roughness = 0.38;
      metalness = 0.08;
      break;
    case 'gas_giant':
      roughness = 0.44;
      metalness = 0.02;
      break;
    case 'hot_lava':
      roughness = 0.82;
      metalness = 0.1;
      emissive = '#ff2a00';
      emissiveIntensity = 1.6; // High incandescent glow
      break;
    case 'icy':
      roughness = 0.22;
      metalness = 0.16;
      break;
    case 'unclassified':
    default:
      roughness = 0.65;
      metalness = 0.05;
      break;
  }

  if (isSelected) {
    emissiveIntensity += 0.5;
  }

  return {
    color: meta.color,
    emissive,
    emissiveIntensity,
    roughness,
    metalness,
  };
}

export const PlanetMesh = forwardRef(function PlanetMesh(
  {
    planetClass = 'unclassified',
    radius = 1.0,
    hasRings = false,
    hovered = false,
    selected = false,
    onClick = null,
    onPointerOver = null,
    onPointerOut = null,
    ...meshProps
  },
  ref
) {
  const matConfig = useMemo(
    () => getPlanetMaterialConfig(planetClass, selected || hovered),
    [planetClass, selected, hovered]
  );

  return (
    <group name={`planet-mesh-${planetClass}`} {...meshProps}>
      {/* Primary Planet Sphere */}
      <mesh
        ref={ref}
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick(e);
          }
        }}
        onPointerOver={(e) => {
          if (onPointerOver) {
            e.stopPropagation();
            onPointerOver(e);
          }
        }}
        onPointerOut={(e) => {
          if (onPointerOut) {
            e.stopPropagation();
            onPointerOut(e);
          }
        }}
      >
        <sphereGeometry args={[radius, 48, 48]} />
        <meshStandardMaterial
          color={matConfig.color}
          emissive={matConfig.emissive}
          emissiveIntensity={matConfig.emissiveIntensity}
          roughness={matConfig.roughness}
          metalness={matConfig.metalness}
        />
      </mesh>

      {/* Optional Gas Giant Rings */}
      {hasRings && (
        <mesh rotation={[-Math.PI / 2.3, 0.2, 0]}>
          <ringGeometry args={[radius * 1.35, radius * 2.25, 64]} />
          <meshStandardMaterial
            color="#d6a868"
            roughness={0.8}
            metalness={0.05}
            transparent
            opacity={0.52}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Selection / Hover Indicator Ring */}
      {(selected || hovered) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 1.25, radius * 1.32, 48]} />
          <meshBasicMaterial
            color={selected ? '#38bdf8' : '#cbd5e1'}
            transparent
            opacity={selected ? 0.85 : 0.45}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
});

export default PlanetMesh;

