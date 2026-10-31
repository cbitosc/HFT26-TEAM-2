/**
 * src/scene/PlanetView.jsx
 * Close-up individual planet inspection view:
 *   - Composes procedural `PlanetMesh` styled by FORGE-lite classification
 *   - Atmospheric glow shell (`AtmosphereGlow`)
 *   - Optional Saturnian rings for gas giants
 *   - Key and fill lighting
 *   - Smooth axial rotation (disabled on prefers-reduced-motion)
 *   - Honest visual caption: "Artist's impression • Not to scale"
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useExplorerStore } from '../store/explorerStore.js';
import { PLANET_CLASS_META, formatNumericValue } from '../data/fieldDictionary.js';
import { prefersReducedMotion } from './cameraDirector.js';
import { PlanetMesh } from './PlanetMesh.jsx';
import { AtmosphereGlow } from './AtmosphereGlow.jsx';

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
  const isGasGiant = planet.planetClass === 'gas_giant';

  return (
    <group name="planet-view-root" position={[0, 0, 0]}>
      {/* Dynamic Key and Fill Lighting */}
      <directionalLight position={[8, 5, 6]} intensity={2.6} color="#ffffff" />
      <directionalLight position={[-6, -3, -5]} intensity={0.5} color="#60a5fa" />
      <ambientLight intensity={0.2} />

      {/* Main Procedural Planet Mesh */}
      <PlanetMesh
        ref={meshRef}
        planetClass={planet.planetClass}
        radius={1.65}
        hasRings={isGasGiant}
      />

      {/* Atmospheric Rim Glow */}
      <AtmosphereGlow planetClass={planet.planetClass} radius={1.65} />

      {/* Informative & Honest Data Overlay */}
      <Html position={[0, -2.45, 0]} center distanceFactor={10}>
        <div className="scene-planet-focus-caption" role="region" aria-label="Planet view summary">
          <div className="caption-title">{planet.name}</div>
          <div className="caption-sub">
            {classMeta.label} •{' '}
            {radeVal !== null
              ? `${radeLim === 1 ? '≤ ' : radeLim === -1 ? '≥ ' : ''}${formatNumericValue(radeVal)} R⊕`
              : 'Radius unknown'}
            {eqtVal !== null ? ` • ${formatNumericValue(eqtVal)} K` : ''}
          </div>
          <div
            style={{
              fontSize: '9.5px',
              color: '#f59e0b',
              marginTop: '3px',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Artist&apos;s impression • Not to scale
          </div>
        </div>
      </Html>
    </group>
  );
}

export default PlanetView;
