/**
 * src/scene/PlanetView.jsx
 * Renders an artist's impression of the selected planet styled by FORGE-lite planetClass.
 * Unclassified planets render in honest neutral grey.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useExplorerStore } from '../store/explorerStore.js';
import { PLANET_CLASS_META, formatNumericValue } from '../data/fieldDictionary.js';
import { prefersReducedMotion } from './cameraDirector.js';

export function PlanetView() {
  const snapshot = useExplorerStore((s) => s.snapshot);
  const selectedPlanetId = useExplorerStore((s) => s.selectedPlanetId);
  const meshRef = useRef(null);

  const planet =
    snapshot && selectedPlanetId ? snapshot.planetById.get(selectedPlanetId) || null : null;

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    if (!prefersReducedMotion()) {
      meshRef.current.rotation.y += delta * 0.22;
    }
  });

  if (!planet) return null;

  const classMeta = PLANET_CLASS_META[planet.planetClass] || PLANET_CLASS_META.unclassified;
  const radeVal = planet.fields?.pl_rade?.v ?? null;
  const radeLim = planet.fields?.pl_rade?.lim ?? null;
  const eqtVal = planet.fields?.pl_eqt?.v ?? null;

  return (
    <group name="planet-view-root" position={[0, 0, 0]}>
      <directionalLight position={[8, 5, 6]} intensity={2.4} color="#ffffff" />
      <directionalLight position={[-6, -3, -5]} intensity={0.45} color="#60a5fa" />

      {/* Main Planet Sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.65, 64, 64]} />
        <meshStandardMaterial
          color={classMeta.color}
          emissive={classMeta.emissive}
          roughness={planet.planetClass === 'gas_giant' ? 0.45 : 0.68}
          metalness={0.08}
        />
      </mesh>

      {/* Subtle Atmosphere Rim Shell */}
      <mesh>
        <sphereGeometry args={[1.74, 48, 48]} />
        <meshBasicMaterial
          color={classMeta.atmosphere}
          transparent
          opacity={0.14}
          side={THREE.BackSide}
        />
      </mesh>

      <Html position={[0, -2.35, 0]} center distanceFactor={10}>
        <div className="scene-planet-focus-caption">
          <div className="caption-title">{planet.name}</div>
          <div className="caption-sub">
            {classMeta.label} •{' '}
            {radeVal !== null
              ? `${radeLim === 1 ? '≤ ' : radeLim === -1 ? '≥ ' : ''}${formatNumericValue(radeVal)} R⊕`
              : 'Radius unknown'}
            {eqtVal !== null ? ` • ${formatNumericValue(eqtVal)} K` : ''}
          </div>
        </div>
      </Html>
    </group>
  );
}

export default PlanetView;
