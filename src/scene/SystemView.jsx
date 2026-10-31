/**
 * src/scene/SystemView.jsx
 * Renders the selected stellar system:
 *   - Host star at [0, 0, 0] colored by effective temperature (st_teff)
 *   - Log-compressed display orbits for planets with known non-limit semi-major axis (pl_orbsmax)
 *   - Explicit dashed "Orbit distance unknown" ring for planets missing pl_orbsmax or limit-bound
 *   - Translucent Kopparapu et al. (2013) Erratum conservative habitable-zone band when valid
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useExplorerStore } from '../store/explorerStore.js';
import { PLANET_CLASS_META, formatNumericValue } from '../data/fieldDictionary.js';
import { prefersReducedMotion } from './cameraDirector.js';

function starColorFromTeff(teff) {
  if (typeof teff !== 'number' || !Number.isFinite(teff) || teff <= 0) {
    return '#cbd5e1';
  }
  if (teff < 3700) return '#ff6e4a';
  if (teff < 5200) return '#ffb463';
  if (teff < 6000) return '#fff1b8';
  if (teff < 7500) return '#f8fafc';
  return '#93c5fd';
}

/**
 * Strictly monotonic log mapping from AU to display scene units.
 * Ensures planets inside [hz_runaway_greenhouse, hz_max_greenhouse] appear visually inside the HZ ring.
 */
function auToSceneRadius(au) {
  if (typeof au !== 'number' || !Number.isFinite(au) || au <= 0) {
    return null;
  }
  return 2.2 + 3.2 * Math.log10(1 + au / 0.008);
}

function planetDisplaySize(radeField) {
  const r = radeField?.v;
  const lim = radeField?.lim;
  if (typeof r !== 'number' || !Number.isFinite(r) || r <= 0 || lim === 1 || lim === -1) {
    return 0.28;
  }
  return Math.min(0.68, Math.max(0.2, 0.18 + 0.12 * Math.log2(1 + r)));
}

function makeCirclePoints(radius, segments = 96) {
  const pts = [];
  for (let i = 0; i <= segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius));
  }
  return pts;
}

function OrbitingPlanetNode({
  planet,
  orbitRadius,
  initialAngle,
  angularRate,
  isUnknownOrbit,
  onSelect,
}) {
  const groupRef = useRef(null);
  const orbitSpeed = useExplorerStore((s) => s.orbitSpeed);
  const angleRef = useRef(initialAngle);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const reduced = prefersReducedMotion();
    if (!reduced && orbitSpeed > 0 && !isUnknownOrbit) {
      angleRef.current += delta * angularRate * orbitSpeed;
    }
    const a = angleRef.current;
    groupRef.current.position.set(Math.cos(a) * orbitRadius, 0, Math.sin(a) * orbitRadius);
  });

  const classMeta = PLANET_CLASS_META[planet.planetClass] || PLANET_CLASS_META.unclassified;
  const sphereRadius = planetDisplaySize(planet.fields?.pl_rade);
  const auVal = planet.fields?.pl_orbsmax?.v;

  return (
    <group
      ref={groupRef}
      position={[Math.cos(initialAngle) * orbitRadius, 0, Math.sin(initialAngle) * orbitRadius]}
    >
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect(planet.id);
        }}
      >
        <sphereGeometry args={[sphereRadius, 28, 28]} />
        <meshStandardMaterial
          color={classMeta.color}
          emissive={classMeta.emissive}
          roughness={0.55}
          metalness={0.1}
        />
      </mesh>

      <Html position={[0, sphereRadius + 0.45, 0]} center distanceFactor={26}>
        <button
          type="button"
          className={`scene-planet-label ${isUnknownOrbit ? 'scene-planet-label-unknown' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(planet.id);
          }}
        >
          <span className="scene-planet-name">{planet.name}</span>
          <span className="scene-planet-sub">
            {isUnknownOrbit
              ? 'orbit unknown'
              : `${formatNumericValue(auVal)} AU`}
          </span>
        </button>
      </Html>
    </group>
  );
}

export function SystemView() {
  const snapshot = useExplorerStore((s) => s.snapshot);
  const selectedSystemId = useExplorerStore((s) => s.selectedSystemId);
  const selectPlanet = useExplorerStore((s) => s.selectPlanet);

  const systemPlanets = useMemo(() => {
    if (!snapshot || !selectedSystemId) return [];
    const list = snapshot.planetsBySystemId.get(selectedSystemId) || [];
    return [...list].sort((a, b) => {
      const auA = a.fields?.pl_orbsmax?.v;
      const auB = b.fields?.pl_orbsmax?.v;
      const validA = typeof auA === 'number' && Number.isFinite(auA);
      const validB = typeof auB === 'number' && Number.isFinite(auB);
      if (validA && validB) return auA - auB;
      if (validA) return -1;
      if (validB) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [snapshot, selectedSystemId]);

  const refPlanet = systemPlanets[0] || null;
  const hostName = refPlanet?.hostname || selectedSystemId || 'System';
  const stTeff = refPlanet?.fields?.st_teff?.v ?? null;
  const starColor = starColorFromTeff(stTeff);

  const hzInnerAu = refPlanet?.fields?.hz_runaway_greenhouse?.v ?? null;
  const hzOuterAu = refPlanet?.fields?.hz_max_greenhouse?.v ?? null;

  const hzBandRadii = useMemo(() => {
    if (
      typeof hzInnerAu === 'number' &&
      typeof hzOuterAu === 'number' &&
      hzInnerAu > 0 &&
      hzOuterAu > hzInnerAu
    ) {
      return {
        inner: auToSceneRadius(hzInnerAu),
        outer: auToSceneRadius(hzOuterAu),
        innerAu: hzInnerAu,
        outerAu: hzOuterAu,
      };
    }
    return null;
  }, [hzInnerAu, hzOuterAu]);

  const { knownOrbitEntries, unknownOrbitEntries, unknownRingRadius } = useMemo(() => {
    const known = [];
    const unknown = [];
    let maxKnownRadius = 6.5;

    systemPlanets.forEach((p, idx) => {
      const smax = p.fields?.pl_orbsmax;
      const hasUsableOrbit =
        smax &&
        typeof smax.v === 'number' &&
        Number.isFinite(smax.v) &&
        smax.v > 0 &&
        smax.lim !== 1 &&
        smax.lim !== -1;

      if (hasUsableOrbit) {
        const r = auToSceneRadius(smax.v);
        if (r > maxKnownRadius) maxKnownRadius = r;
        const periodDays = p.fields?.pl_orbper?.v;
        const angularRate =
          typeof periodDays === 'number' && periodDays > 0
            ? Math.min(1.6, Math.max(0.12, 12 / Math.cbrt(periodDays)))
            : 0.45 / Math.sqrt(1 + idx);

        known.push({
          planet: p,
          orbitRadius: r,
          initialAngle: (idx * 2.39996) % (Math.PI * 2),
          angularRate,
        });
      } else {
        unknown.push({
          planet: p,
        });
      }
    });

    const ringR = Math.max(9.5, maxKnownRadius + 2.4);
    return {
      knownOrbitEntries: known,
      unknownOrbitEntries: unknown,
      unknownRingRadius: ringR,
    };
  }, [systemPlanets]);

  if (!refPlanet) {
    return null;
  }

  return (
    <group name="system-view-root">
      {/* Host Star at [0, 0, 0] */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[1.15, 32, 32]} />
        <meshBasicMaterial color={starColor} />
      </mesh>
      <pointLight position={[0, 0, 0]} intensity={2.6} distance={80} color={starColor} />

      <Html position={[0, -1.65, 0]} center distanceFactor={28}>
        <div className="scene-star-badge">
          <strong>{hostName}</strong>
          {stTeff !== null ? ` (${formatNumericValue(stTeff)} K)` : ' (Teff unknown)'}
        </div>
      </Html>

      {/* Translucent Kopparapu Conservative Habitable Zone Band */}
      {hzBandRadii && (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
            <ringGeometry args={[hzBandRadii.inner, hzBandRadii.outer, 96]} />
            <meshBasicMaterial
              color="#10b981"
              transparent
              opacity={0.16}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <Html position={[hzBandRadii.outer, 0.25, 0]} center distanceFactor={32}>
            <div className="scene-hz-label" title="Conservative HZ (Kopparapu et al. 2013 Erratum)">
              Conservative HZ ({formatNumericValue(hzBandRadii.innerAu)}–
              {formatNumericValue(hzBandRadii.outerAu)} AU)
            </div>
          </Html>
        </group>
      )}

      {/* Known Orbit Rings & Orbiting Planets */}
      {knownOrbitEntries.map((entry) => (
        <group key={entry.planet.id}>
          <Line
            points={makeCirclePoints(entry.orbitRadius, 96)}
            color="#334155"
            lineWidth={1}
          />
          <OrbitingPlanetNode
            planet={entry.planet}
            orbitRadius={entry.orbitRadius}
            initialAngle={entry.initialAngle}
            angularRate={entry.angularRate}
            isUnknownOrbit={false}
            onSelect={selectPlanet}
          />
        </group>
      ))}

      {/* Dashed "Orbit distance unknown" Ring for planets without usable pl_orbsmax */}
      {unknownOrbitEntries.length > 0 && (
        <group>
          <Line
            points={makeCirclePoints(unknownRingRadius, 96)}
            color="#64748b"
            lineWidth={1}
            dashed
            dashSize={0.45}
            gapSize={0.35}
          />
          <Html position={[0, 0.2, -unknownRingRadius]} center distanceFactor={32}>
            <div className="scene-unknown-ring-badge">
              Dashed ring: Orbit distance unknown or limit-bound in archive
            </div>
          </Html>
          {unknownOrbitEntries.map((entry, idx) => {
            const angle = (idx / Math.max(1, unknownOrbitEntries.length)) * Math.PI * 2 + 0.4;
            return (
              <OrbitingPlanetNode
                key={entry.planet.id}
                planet={entry.planet}
                orbitRadius={unknownRingRadius}
                initialAngle={angle}
                angularRate={0}
                isUnknownOrbit
                onSelect={selectPlanet}
              />
            );
          })}
        </group>
      )}
    </group>
  );
}

export default SystemView;
