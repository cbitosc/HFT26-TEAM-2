/**
 * src/scene/SystemView.jsx
 * Interactive Star-System 3D view:
 *   - Host star (`StarMesh`) at [0, 0, 0] with temperature-derived spectral color and corona
 *   - Keplerian orbits (`OrbitLine`) with log-compressed semi-major axis (pl_orbsmax) & eccentricity
 *   - Dashed "Orbit distance unknown" ring for planets missing pl_orbsmax or limit-bound
 *   - Concentric Kopparapu et al. (2013) Erratum conservative habitable-zone band
 *   - Interactive orbiting planets (`PlanetMesh` + `AtmosphereGlow`) with selection handling
 *   - Honest visual labels and scale caveats
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useExplorerStore } from '../store/explorerStore.js';
import { formatNumericValue } from '../data/fieldDictionary.js';
import { prefersReducedMotion } from './cameraDirector.js';
import { StarMesh } from './StarMesh.jsx';
import { OrbitLine } from './OrbitLine.jsx';
import { PlanetMesh } from './PlanetMesh.jsx';
import { AtmosphereGlow } from './AtmosphereGlow.jsx';

/**
 * Strictly monotonic log mapping from AU to display scene units.
 * Ensures planets inside [hz_runaway_greenhouse, hz_max_greenhouse] appear visually inside the HZ ring.
 *
 * @param {number} au Semi-major axis in Astronomical Units
 * @returns {number|null} Scene units radius
 */
export function auToSceneRadius(au) {
  if (typeof au !== 'number' || !Number.isFinite(au) || au <= 0) {
    return null;
  }
  return 2.2 + 3.2 * Math.log10(1 + au / 0.008);
}

/**
 * Calculates display sphere radius for an orbiting planet.
 * Missing or limit-bound radius uses a sensible default size (0.28).
 *
 * @param {object} radeField Field object with v and lim
 * @returns {number} Display radius
 */
export function planetDisplaySize(radeField) {
  const r = radeField?.v;
  const lim = radeField?.lim;
  if (typeof r !== 'number' || !Number.isFinite(r) || r <= 0 || lim === 1 || lim === -1) {
    return 0.28;
  }
  return Math.min(0.68, Math.max(0.2, 0.18 + 0.12 * Math.log2(1 + r)));
}

function OrbitingPlanetNode({
  planet,
  orbitRadius,
  eccentricity = 0,
  initialAngle,
  angularRate,
  isUnknownOrbit,
  onSelect,
}) {
  const groupRef = useRef(null);
  const orbitSpeed = useExplorerStore((s) => s.orbitSpeed);
  const selectedPlanetId = useExplorerStore((s) => s.selectedPlanetId);
  const angleRef = useRef(initialAngle);

  const e =
    typeof eccentricity === 'number' && Number.isFinite(eccentricity) && eccentricity >= 0.05 && eccentricity < 0.95
      ? eccentricity
      : 0;
  const semiMinor = orbitRadius * Math.sqrt(Math.max(0.01, 1 - e * e));
  const focusOffset = orbitRadius * e;

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const reduced = prefersReducedMotion();
    if (!reduced && orbitSpeed > 0 && !isUnknownOrbit) {
      angleRef.current += delta * angularRate * orbitSpeed;
    }
    const a = angleRef.current;
    const x = Math.cos(a) * orbitRadius - focusOffset;
    const z = Math.sin(a) * semiMinor;
    groupRef.current.position.set(x, 0, z);
  });

  const sphereRadius = planetDisplaySize(planet.fields?.pl_rade);
  const auVal = planet.fields?.pl_orbsmax?.v;
  const isSelected = selectedPlanetId === planet.id;

  const initX = Math.cos(initialAngle) * orbitRadius - focusOffset;
  const initZ = Math.sin(initialAngle) * semiMinor;

  return (
    <group ref={groupRef} position={[initX, 0, initZ]}>
      {/* Procedural Planet Mesh with Class Styling */}
      <PlanetMesh
        planetClass={planet.planetClass}
        radius={sphereRadius}
        selected={isSelected}
        onClick={() => onSelect(planet.id)}
      />

      {/* Atmospheric Rim Glow */}
      <AtmosphereGlow
        planetClass={planet.planetClass}
        radius={sphereRadius}
        scale={1.08}
      />

      {/* Interactive Planet HTML Tag */}
      <Html position={[0, sphereRadius + 0.45, 0]} center distanceFactor={26}>
        <button
          type="button"
          className={`scene-planet-label ${isUnknownOrbit ? 'scene-planet-label-unknown' : ''} ${
            isSelected ? 'scene-planet-label-selected' : ''
          }`}
          onClick={(ev) => {
            ev.stopPropagation();
            onSelect(planet.id);
          }}
          title={`Click to inspect ${planet.name}`}
        >
          <span className="scene-planet-name">{planet.name}</span>
          <span className="scene-planet-sub">
            {isUnknownOrbit ? 'orbit unknown' : `${formatNumericValue(auVal)} AU`}
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
  const hostName = refPlanet?.hostname || selectedSystemId || 'Host Star';
  const stTeff = refPlanet?.fields?.st_teff?.v ?? null;
  const stRad = refPlanet?.fields?.st_rad?.v ?? null;

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

        const eccVal = p.fields?.pl_orbeccen?.v;
        const eccentricity =
          typeof eccVal === 'number' && Number.isFinite(eccVal) && eccVal >= 0.05 && eccVal < 0.95
            ? eccVal
            : 0;

        known.push({
          planet: p,
          orbitRadius: r,
          eccentricity,
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
      {/* Central Host Star Mesh */}
      <StarMesh
        name={hostName}
        teff={stTeff}
        stRad={stRad}
        showLabel
      />

      {/* Translucent Kopparapu Conservative Habitable Zone Band */}
      {hzBandRadii && (
        <group name="habitable-zone-band">
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

      {/* Known Orbit Paths & Orbiting Planets */}
      {knownOrbitEntries.map((entry) => (
        <group key={entry.planet.id}>
          <OrbitLine
            radius={entry.orbitRadius}
            eccentricity={entry.eccentricity}
            isUnknown={false}
          />
          <OrbitingPlanetNode
            planet={entry.planet}
            orbitRadius={entry.orbitRadius}
            eccentricity={entry.eccentricity}
            initialAngle={entry.initialAngle}
            angularRate={entry.angularRate}
            isUnknownOrbit={false}
            onSelect={selectPlanet}
          />
        </group>
      ))}

      {/* Dashed "Orbit distance unknown" Ring for planets without usable pl_orbsmax */}
      {unknownOrbitEntries.length > 0 && (
        <group name="unknown-orbit-ring">
          <OrbitLine
            radius={unknownRingRadius}
            isUnknown
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
                eccentricity={0}
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
