/**
 * shared/domain/galaxyPosition.js
 * 3D Cartesian sky position (in parsecs) and log-compressed display coordinates
 * for the Galaxy view (ARCHITECTURE.md Section 6.3).
 *
 * Rules:
 *   x = d * cos(dec) * cos(ra)
 *   y = d * cos(dec) * sin(ra)
 *   z = d * sin(dec)
 *   Display radius compressed with r' = k * ln(1 + r / r0) keeping direction vector.
 *   Missing ra, dec, or sy_dist (or sy_dist <= 0) -> null (never 0).
 */

import { GALAXY_DISPLAY_PARAMS } from './thresholds.js';

const DEG_TO_RAD = Math.PI / 180;

/**
 * Computes 3D Cartesian coordinates in parsecs and log-compressed display coordinates.
 * Returns `{ posPc: null, posDisplay: null }` if any input is null or invalid.
 *
 * @param {number|null} raDeg
 * @param {number|null} decDeg
 * @param {number|null} distPc
 * @returns {{ posPc: {x:number,y:number,z:number}|null, posDisplay: {x:number,y:number,z:number}|null }}
 */
export function calcGalaxyPosition(raDeg, decDeg, distPc) {
  if (
    typeof raDeg !== 'number' ||
    !Number.isFinite(raDeg) ||
    typeof decDeg !== 'number' ||
    !Number.isFinite(decDeg) ||
    typeof distPc !== 'number' ||
    !Number.isFinite(distPc) ||
    distPc <= 0
  ) {
    return { posPc: null, posDisplay: null };
  }

  const alpha = raDeg * DEG_TO_RAD;
  const delta = decDeg * DEG_TO_RAD;
  const cosDelta = Math.cos(delta);

  const ux = cosDelta * Math.cos(alpha);
  const uy = cosDelta * Math.sin(alpha);
  const uz = Math.sin(delta);

  const x = Number((distPc * ux).toFixed(2));
  const y = Number((distPc * uy).toFixed(2));
  const z = Number((distPc * uz).toFixed(2));

  const rDisplay = GALAXY_DISPLAY_PARAMS.k * Math.log(1 + distPc / GALAXY_DISPLAY_PARAMS.r0Pc);
  const dx = Number((rDisplay * ux).toFixed(2));
  const dy = Number((rDisplay * uy).toFixed(2));
  const dz = Number((rDisplay * uz).toFixed(2));

  return {
    posPc: { x, y, z },
    posDisplay: { x: dx, y: dy, z: dz },
  };
}
