/**
 * src/scene/cameraDirector.js
 * Coordinates camera transitions across Galaxy, System, and Planet views.
 * Respects `prefers-reduced-motion: reduce` by disabling animated transitions.
 */

import { useEffect, useRef } from 'react';
import { useExplorerStore } from '../store/explorerStore.js';

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

    if (cameraRequest.level === 'galaxy') {
      controls.setLookAt(0, 42, 115, 0, 0, 0, animate);
    } else if (cameraRequest.level === 'system') {
      controls.setLookAt(0, 14, 22, 0, 0, 0, animate);
    } else if (cameraRequest.level === 'planet') {
      controls.setLookAt(0, 1.2, 5.8, 0, 0, 0, animate);
    }
  }, [cameraRequest, controlsRef]);

  return null;
}

export default CameraDirector;
