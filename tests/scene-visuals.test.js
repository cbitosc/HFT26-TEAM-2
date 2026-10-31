/**
 * tests/scene-visuals.test.js
 * Focused tests for TASK D1:
 *   - StarMesh: spectral color mapping, logarithmic radius damping, fallback safety
 *   - OrbitLine: circular and elliptical orbit points generation, focus offset, segment count
 *   - PlanetMesh: FORGE-lite visual styling (rocky, sub-Neptune, gas giant, hot/lava, icy, unclassified)
 *   - AtmosphereGlow: Fresnel shell configuration and per-class atmospheric tints
 *   - cameraDirector: viewLevel target calculation, responsive planet framing, reduced motion guard
 *   - SystemView / PlanetView: AU-to-scene mapping monotonicity, honest defaults, component exports
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { StarMesh, starColorFromTeff, starDisplayRadius } from '../src/scene/StarMesh.jsx';
import { OrbitLine, generateOrbitPoints } from '../src/scene/OrbitLine.jsx';
import { PlanetMesh, getPlanetMaterialConfig } from '../src/scene/PlanetMesh.jsx';
import { AtmosphereGlow, getAtmosphereConfig } from '../src/scene/AtmosphereGlow.jsx';
import { CameraDirector, calculateCameraTargets, prefersReducedMotion } from '../src/scene/cameraDirector.js';
import { SystemView, auToSceneRadius, planetDisplaySize } from '../src/scene/SystemView.jsx';
import { PlanetView } from '../src/scene/PlanetView.jsx';

describe('TASK D1 — 3D Star-System and Planet Visualisation', () => {
  describe('StarMesh — Spectral Type and Stellar Properties', () => {
    it('maps effective temperature to physical spectral sequence colors', () => {
      expect(starColorFromTeff(3000)).toBe('#ff6e4a'); // M-dwarf (red)
      expect(starColorFromTeff(4200)).toBe('#ffb463'); // K-type (orange)
      expect(starColorFromTeff(5778)).toBe('#fff1b8'); // G-type (Sun-like yellow-white)
      expect(starColorFromTeff(6800)).toBe('#f8fafc'); // F/A-type (white)
      expect(starColorFromTeff(9800)).toBe('#93c5fd'); // B/O-type (blue-white)
    });

    it('preserves missing, null, or non-physical temperatures as neutral stellar slate', () => {
      expect(starColorFromTeff(null)).toBe('#cbd5e1');
      expect(starColorFromTeff(undefined)).toBe('#cbd5e1');
      expect(starColorFromTeff(-500)).toBe('#cbd5e1');
      expect(starColorFromTeff(0)).toBe('#cbd5e1');
      expect(starColorFromTeff(NaN)).toBe('#cbd5e1');
    });

    it('damps stellar radius to prevent oversized stars from obscuring planetary orbits', () => {
      expect(starDisplayRadius(null)).toBe(1.15);
      expect(starDisplayRadius(1.0)).toBeCloseTo(1.15, 2);
      expect(starDisplayRadius(0.1)).toBeGreaterThanOrEqual(0.65);
      expect(starDisplayRadius(50.0)).toBeLessThanOrEqual(2.4);
    });

    it('exports StarMesh component', () => {
      expect(typeof StarMesh).toBe('function');
    });
  });

  describe('OrbitLine — Keplerian Orbital Path Geometry', () => {
    it('returns empty array for invalid or non-positive orbit radius', () => {
      expect(generateOrbitPoints(null)).toEqual([]);
      expect(generateOrbitPoints(0)).toEqual([]);
      expect(generateOrbitPoints(-2.5)).toEqual([]);
    });

    it('generates circular orbit vertices centered on origin when eccentricity is 0', () => {
      const points = generateOrbitPoints(10, 0, 32);
      expect(points.length).toBe(33); // 32 segments + 1 closing point
      expect(points[0]).toBeInstanceOf(THREE.Vector3);

      // Verify points lie on circle of radius 10 in XZ plane
      points.forEach((pt) => {
        expect(pt.y).toBe(0);
        const dist = Math.hypot(pt.x, pt.z);
        expect(dist).toBeCloseTo(10, 2);
      });
    });

    it('generates eccentric orbit with focus shifted along major axis', () => {
      const radius = 10;
      const eccentricity = 0.5;
      const points = generateOrbitPoints(radius, eccentricity, 64);
      expect(points.length).toBe(65);

      // Periastron at theta = 0: x = radius - radius*e = 10 - 5 = 5
      expect(points[0].x).toBeCloseTo(5, 2);
      expect(points[0].z).toBeCloseTo(0, 2);

      // Apastron at theta = PI (point index 32): x = -radius - radius*e = -10 - 5 = -15
      expect(points[32].x).toBeCloseTo(-15, 2);
      expect(points[32].z).toBeCloseTo(0, 2);
    });

    it('exports OrbitLine component', () => {
      expect(typeof OrbitLine).toBe('function');
    });
  });

  describe('PlanetMesh — FORGE-lite Visual Class Styling', () => {
    it('configures distinct visual appearance for terrestrial rocky planets', () => {
      const config = getPlanetMaterialConfig('rocky');
      expect(config.color).toBe('#d98a5b');
      expect(config.roughness).toBeGreaterThanOrEqual(0.7);
      expect(config.metalness).toBeLessThanOrEqual(0.1);
    });

    it('configures distinct visual appearance for volatile-rich sub-Neptunes', () => {
      const config = getPlanetMaterialConfig('sub_neptune');
      expect(config.color).toBe('#4fa3d1');
      expect(config.roughness).toBeLessThan(0.5);
    });

    it('configures distinct visual appearance for gas giants', () => {
      const config = getPlanetMaterialConfig('gas_giant');
      expect(config.color).toBe('#d6a868');
      expect(config.roughness).toBeCloseTo(0.44, 2);
    });

    it('configures high incandescent glow for ultra-hot lava worlds', () => {
      const config = getPlanetMaterialConfig('hot_lava');
      expect(config.color).toBe('#ff5733');
      expect(config.emissive).toBe('#ff2a00');
      expect(config.emissiveIntensity).toBeGreaterThanOrEqual(1.5);
    });

    it('configures high-albedo specular gloss for icy worlds', () => {
      const config = getPlanetMaterialConfig('icy');
      expect(config.color).toBe('#9ad5e8');
      expect(config.roughness).toBeLessThan(0.3);
      expect(config.metalness).toBeGreaterThanOrEqual(0.1);
    });

    it('configures honest neutral slate grey for unclassified bodies', () => {
      const config = getPlanetMaterialConfig('unclassified');
      expect(config.color).toBe('#8a94a6');
      expect(config.emissiveIntensity).toBeLessThanOrEqual(1.0);
    });

    it('boosts emissive intensity when selected', () => {
      const unselected = getPlanetMaterialConfig('rocky', false);
      const selected = getPlanetMaterialConfig('rocky', true);
      expect(selected.emissiveIntensity).toBeGreaterThan(unselected.emissiveIntensity);
    });

    it('exports PlanetMesh component', () => {
      expect(PlanetMesh).toBeDefined();
    });
  });

  describe('AtmosphereGlow — Atmospheric Shell Profiles', () => {
    it('provides tailored atmospheric colors and opacities per planet class', () => {
      const rockyAtmo = getAtmosphereConfig('rocky');
      const gasAtmo = getAtmosphereConfig('gas_giant');
      const unclassAtmo = getAtmosphereConfig('unclassified');

      expect(rockyAtmo.color).toBe('#88b4e7');
      expect(rockyAtmo.opacity).toBeGreaterThan(0.1);

      expect(gasAtmo.color).toBe('#f0cfa0');
      expect(gasAtmo.scale).toBeGreaterThan(1.05);

      expect(unclassAtmo.opacity).toBeLessThanOrEqual(0.1);
    });

    it('exports AtmosphereGlow component', () => {
      expect(typeof AtmosphereGlow).toBe('function');
    });
  });

  describe('cameraDirector — View Transitions & Reduced Motion', () => {
    it('calculates camera position and look-at target across all 3 view levels', () => {
      const galaxy = calculateCameraTargets('galaxy');
      expect(galaxy.position).toEqual([0, 42, 115]);
      expect(galaxy.target).toEqual([0, 0, 0]);

      const system = calculateCameraTargets('system');
      expect(system.position).toEqual([0, 16, 26]);
      expect(system.target).toEqual([0, 0, 0]);

      const planet = calculateCameraTargets('planet', { radius: 1.65 });
      expect(planet.position[1]).toBeCloseTo(1.65 * 0.75, 2);
      expect(planet.position[2]).toBeGreaterThan(5);
      expect(planet.target).toEqual([0, 0, 0]);
    });

    it('falls back to galaxy framing for unknown levels', () => {
      const fallback = calculateCameraTargets('unknown');
      expect(fallback.position).toEqual([0, 42, 115]);
      expect(fallback.target).toEqual([0, 0, 0]);
    });

    it('safely queries reduced motion preference without crashing', () => {
      const reduced = prefersReducedMotion();
      expect(typeof reduced).toBe('boolean');
    });

    it('exports CameraDirector component', () => {
      expect(typeof CameraDirector).toBe('function');
    });
  });

  describe('SystemView & PlanetView — Scientific Consistency & Honesty', () => {
    it('auToSceneRadius provides strictly monotonic log distance compression', () => {
      expect(auToSceneRadius(null)).toBeNull();
      expect(auToSceneRadius(0)).toBeNull();
      expect(auToSceneRadius(-1)).toBeNull();

      const rMercury = auToSceneRadius(0.387);
      const rEarth = auToSceneRadius(1.0);
      const rJupiter = auToSceneRadius(5.2);
      const rNeptune = auToSceneRadius(30.07);

      expect(rMercury).toBeGreaterThan(2.2);
      expect(rEarth).toBeGreaterThan(rMercury);
      expect(rJupiter).toBeGreaterThan(rEarth);
      expect(rNeptune).toBeGreaterThan(rJupiter);
    });

    it('planetDisplaySize scales with radius and gracefully falls back for limits/unknowns', () => {
      // Default fallback size for unknown or limit values
      expect(planetDisplaySize(null)).toBe(0.28);
      expect(planetDisplaySize({ v: null, lim: 0 })).toBe(0.28);
      expect(planetDisplaySize({ v: 2.5, lim: 1 })).toBe(0.28); // Upper limit
      expect(planetDisplaySize({ v: 2.5, lim: -1 })).toBe(0.28); // Lower limit

      // Earth-sized vs Jupiter-sized
      const rEarth = planetDisplaySize({ v: 1.0, lim: 0 });
      const rJupiter = planetDisplaySize({ v: 11.2, lim: 0 });
      expect(rEarth).toBeGreaterThanOrEqual(0.2);
      expect(rJupiter).toBeGreaterThan(rEarth);
      expect(rJupiter).toBeLessThanOrEqual(0.68);
    });

    it('exports SystemView and PlanetView components', () => {
      expect(typeof SystemView).toBe('function');
      expect(typeof PlanetView).toBe('function');
    });
  });
});

