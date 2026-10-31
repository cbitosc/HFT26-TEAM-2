/**
 * src/scene/cameraDirector.js
 * Coordinates camera transitions across Galaxy, System, and Planet views.
 * Respects `prefers-reduced-motion: reduce` by disabling animated transitions.
 * Pure target calculation functions are exported for direct testing and modular control.
 */

import { useEffect, useRef } from 'react';
import { useExplorerStore } from '../store/explorerStore.js';

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Calculates camera position and look-at target for a given view level.
 *
 * @param {'galaxy'|'system'|'planet'|string} level View level
 * @param {object} [options={}] Additional context (e.g. planet radius, custom distances)
 * @returns {{ position: [number, number, number], target: [number, number, number] }}
 */
export function calculateCameraTargets(level, options = {}) {
  switch (level) {
    case 'galaxy':
      return {
        position: [0, 42, 115],
        target: [0, 0, 0],
      };
    case 'system':
      return {
        position: [0, 16, 26],
        target: [0, 0, 0],
      };
    case 'planet': {
      const radius = typeof options.radius === 'number' && options.radius > 0 ? options.radius : 1.65;
      const distance = Math.max(3.8, radius * 3.4);
      return {
        position: [0, radius * 0.75, distance],
        target: [0, 0, 0],
      };
    }
    default:
      return {
        position: [0, 42, 115],
        target: [0, 0, 0],
      };
  }
}

export function CameraDirector({ controlsRef }) {
  const cameraRequest = useExplorerStore((s) => s.cameraRequest);
  const lastSeqRef = useRef(0);

  useEffect(() => {
    const controls = controlsRef?.current;
    if (!controls || !cameraRequest) return;
    if (cameraRequest.seq === lastSeqRef.current) return;

    lastSeqRef.current = cameraRequest.seq;
    const animate = !prefersReducedMotion();

    const targets = calculateCameraTargets(cameraRequest.level);
    const [px, py, pz] = targets.position;
    const [tx, ty, tz] = targets.target;

    controls.setLookAt(px, py, pz, tx, ty, tz, animate);
  }, [cameraRequest, controlsRef]);

  return null;
}

export default CameraDirector;
