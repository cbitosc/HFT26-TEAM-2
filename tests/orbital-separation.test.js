import { describe, expect, it } from 'vitest';
import {
  isTrueOrbitalDistanceEstablished,
  resolveSemiMajorAxisField,
} from '../shared/domain/kepler.js';
import { classifyHzPosition, buildHzEdgeFields } from '../shared/domain/hz.js';
import { evalHzPositionIndicator } from '../shared/domain/habLab.js';
import { resolveInsolationField } from '../shared/domain/luminosity.js';
import { makeField } from '../shared/receipts.js';

describe('Orbital Separation vs Keplerian Semi-Major Axis (DEC-012, 2M0437 b Regression)', () => {
  it('identifies 2M0437 b as unestablished true orbital semi-major axis while preserving archive field', () => {
    const fields2M0437b = {
      pl_orbsmax: makeField({
        v: 118.0,
        e1: 1.3,
        e2: -1.3,
        lim: 0,
        type: 'archive',
        ref: { text: 'Gaidos et al. 2022', raw: '<a refstr=GAIDOS_ET_AL_2022>Gaidos et al. 2022</a>' },
      }),
      pl_orbper: makeField({ v: null, type: 'archive' }),
      pl_orbeccen: makeField({ v: null, type: 'archive' }),
      st_teff: makeField({ v: 3100, lim: 0, type: 'archive' }),
      st_lum_linear: makeField({ v: 0.0016, lim: 0, type: 'calculated' }),
    };

    // Value and receipt remain intact
    expect(fields2M0437b.pl_orbsmax.v).toBe(118.0);
    expect(fields2M0437b.pl_orbsmax.lim).toBe(0);
    expect(fields2M0437b.pl_orbsmax.type).toBe('archive');

    // Distance type is unestablished
    const isEstablished = isTrueOrbitalDistanceEstablished(fields2M0437b, 'Imaging');
    expect(isEstablished).toBe(false);

    // HZ classification returns unknown with receipt and honest note
    const hzBuilt = buildHzEdgeFields('2m0437-b', fields2M0437b.st_teff, fields2M0437b.st_lum_linear);
    const hzIndicator = evalHzPositionIndicator(
      '2m0437-b',
      fields2M0437b,
      hzBuilt.edges,
      'log10',
      'Imaging'
    );

    expect(hzIndicator.status).toBe('unknown');
    expect(hzIndicator.confidence).toBe('unknown');
    expect(hzIndicator.receipts).toEqual(['2m0437-b.pl_orbsmax']);
    expect(hzIndicator.note).toContain('Archive pl_orbsmax is retained with receipt');
    expect(hzIndicator.note).toContain('true 3D orbital semi-major axis is not established');
  });

  it('recognizes confirmed Keplerian orbits for transit/RV planets', () => {
    const trappistFields = {
      pl_orbsmax: makeField({ v: 0.02925, lim: 0, type: 'archive' }),
      pl_orbper: makeField({ v: 6.099615, lim: 0, type: 'archive' }),
      pl_orbeccen: makeField({ v: 0.005, lim: 0, e1: 0.003, e2: -0.003, type: 'archive' }),
      st_teff: makeField({ v: 2566, lim: 0, type: 'archive' }),
      st_lum_linear: makeField({ v: 0.00055, lim: 0, type: 'calculated' }),
    };

    expect(isTrueOrbitalDistanceEstablished(trappistFields, 'Transit')).toBe(true);
  });

  it('accepts Kepler-3 calculated fallback semi-major axis as established', () => {
    const calculatedOrbsmax = makeField({
      v: 1.0,
      lim: null,
      type: 'calculated',
      formula: 'kepler3:cbrt(st_mass*(pl_orbper/365.25)^2)',
    });
    const fields = {
      pl_orbsmax: calculatedOrbsmax,
      pl_orbper: makeField({ v: 365.25, lim: 0, type: 'archive' }),
    };

    expect(isTrueOrbitalDistanceEstablished(fields, 'Radial Velocity')).toBe(true);
  });

  it('rejects limit-bound separations (lim !== 0)', () => {
    const fieldsLimit = {
      pl_orbsmax: makeField({ v: 50.0, lim: 1, type: 'archive' }),
      pl_orbper: makeField({ v: 10000, lim: 0, type: 'archive' }),
    };
    expect(isTrueOrbitalDistanceEstablished(fieldsLimit, 'Imaging')).toBe(false);
  });

  it('requires constrained eccentricity for separation-risk methods (Imaging, Microlensing, Disk Kinematics)', () => {
    // Nominal period from statistical deprojection without constrained eccentricity
    const unconstrainedImaging = {
      pl_orbsmax: makeField({
        v: 40.0,
        lim: 0,
        type: 'archive',
        ref: { raw: '<ref1>' },
      }),
      pl_orbper: makeField({
        v: 90000,
        lim: 0,
        type: 'archive',
        ref: { raw: '<ref1>' },
      }),
      pl_orbeccen: makeField({ v: null, type: 'archive' }),
    };
    expect(isTrueOrbitalDistanceEstablished(unconstrainedImaging, 'Imaging')).toBe(false);
    expect(isTrueOrbitalDistanceEstablished(unconstrainedImaging, 'Microlensing')).toBe(false);
    expect(isTrueOrbitalDistanceEstablished(unconstrainedImaging, 'Disk Kinematics')).toBe(false);

    // Co-referenced constrained eccentricity satisfies the requirement
    const constrainedImaging = {
      pl_orbsmax: makeField({
        v: 40.0,
        lim: 0,
        type: 'archive',
        ref: { raw: '<ref1>' },
      }),
      pl_orbper: makeField({
        v: 90000,
        lim: 0,
        type: 'archive',
        ref: { raw: '<ref1>' },
      }),
      pl_orbeccen: makeField({
        v: 0.15,
        e1: 0.05,
        e2: -0.05,
        lim: 0,
        type: 'archive',
        ref: { raw: '<ref1>' },
      }),
    };
    expect(isTrueOrbitalDistanceEstablished(constrainedImaging, 'Imaging')).toBe(true);
  });

  it('suppresses fallback insolation calculation when distance is unestablished', () => {
    const unestablishedOrbsmax = makeField({ v: 118.0, lim: 0, type: 'archive' });
    const stLumLinear = makeField({ v: 0.0016, lim: 0, type: 'calculated' });

    // When isEstablished is false, fallback S = L / a^2 is NOT calculated
    const insolSuppressed = resolveInsolationField(
      '2m0437-b',
      makeField({ v: null, type: 'archive' }),
      stLumLinear,
      unestablishedOrbsmax,
      false
    );
    expect(insolSuppressed.v).toBe(null);

    // If archive pl_insol exists, it is preserved even if orbit is unestablished
    const archiveInsol = makeField({ v: 0.0001, lim: 0, type: 'archive' });
    const insolPreserved = resolveInsolationField(
      '2m0437-b',
      archiveInsol,
      stLumLinear,
      unestablishedOrbsmax,
      false
    );
    expect(insolPreserved.v).toBe(0.0001);
  });
});

