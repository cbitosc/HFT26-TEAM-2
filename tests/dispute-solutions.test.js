/**
 * tests/dispute-solutions.test.js
 * Comprehensive unit and regression tests for NASA `ps` published solutions,
 * DISPUTE domain interval overlap comparisons, missing uncertainties,
 * and `solutions.json` snapshot output.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';

import {
  DISPUTE_FIELDS,
  areIntervalsDisjoint,
  buildDisputeSummary,
  decodeCompactSolution,
  decodeCompactSolutions,
  evaluateFieldDispute,
  extractPlanetSolutions,
} from '../shared/domain/dispute.js';
import { buildSolutionsSnapshot } from '../scripts/build-snapshot.js';
import { probeNasaPsColumns } from '../scripts/lib/tap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('NASA Multiple Published Solutions & DISPUTE Integration (TASK C1)', () => {
  const snapshotId = '2026-10-30-79bb8609';
  const solutionsJsonPath = path.join(ROOT, 'public', 'snapshots', snapshotId, 'solutions.json');
  const crosscatalogFlagsPath = path.join(
    ROOT,
    'public',
    'snapshots',
    snapshotId,
    'crosscatalog-flags.json'
  );

  describe('DISPUTE Math & Interval Overlap Rules (ARCHITECTURE.md Section 6.5 & DEC-007)', () => {
    it('detects disjoint intervals correctly with IEEE-754 epsilon guard', () => {
      // Disjoint: [1.0, 1.2] vs [1.3, 1.5]
      expect(areIntervalsDisjoint(1.0, 1.2, 1.3, 1.5)).toBe(true);
      // Overlapping: [1.0, 1.3] vs [1.2, 1.5]
      expect(areIntervalsDisjoint(1.0, 1.3, 1.2, 1.5)).toBe(false);
      // Touching endpoints [1.0, 1.2] vs [1.2, 1.4] are NOT disjoint
      expect(areIntervalsDisjoint(1.0, 1.2, 1.2, 1.4)).toBe(false);
      // Contained: [1.0, 2.0] vs [1.2, 1.4]
      expect(areIntervalsDisjoint(1.0, 2.0, 1.2, 1.4)).toBe(false);
    });

    it('returns contested: true when any pair of valid assessable solutions does not overlap', () => {
      const solutions = [
        { v: 1.0, e1: 0.1, e2: -0.1, lim: 0, ref: 'Study A 2018' }, // [0.9, 1.1]
        { v: 1.5, e1: 0.1, e2: -0.1, lim: 0, ref: 'Study B 2021' }, // [1.4, 1.6]
      ];
      const res = evaluateFieldDispute(solutions);

      expect(res.n).toBe(2);
      expect(res.nAssessable).toBe(2);
      expect(res.contested).toBe(true);
      expect(res.min).toBe(1.0);
      expect(res.max).toBe(1.5);
      expect(res.nRefs).toBe(2);
      expect(res.uncertaintyMissing).toBe(false);
    });

    it('returns contested: false ONLY when >= 2 assessable solutions exist and all intervals overlap without missing errors', () => {
      const solutions = [
        { v: 1.0, e1: 0.2, e2: -0.2, lim: 0, ref: 'Study A 2018' }, // [0.8, 1.2]
        { v: 1.1, e1: 0.2, e2: -0.1, lim: 0, ref: 'Study B 2021' }, // [1.0, 1.3]
      ];
      const res = evaluateFieldDispute(solutions);

      expect(res.n).toBe(2);
      expect(res.nAssessable).toBe(2);
      expect(res.contested).toBe(false);
      expect(res.uncertaintyMissing).toBe(false);
    });

    it('returns contested: null ("cannot assess") when uncertainty is missing on non-disjoint solutions', () => {
      // Missing e1 or e2: must never be zero-filled or guessed
      const solutions = [
        { v: 1.0, e1: null, e2: null, lim: 0, ref: 'Discovery Study' },
        { v: 1.1, e1: 0.1, e2: -0.1, lim: 0, ref: 'Followup Study' },
      ];
      const res = evaluateFieldDispute(solutions);

      expect(res.n).toBe(2);
      expect(res.nAssessable).toBe(1);
      expect(res.uncertaintyMissing).toBe(true);
      expect(res.contested).toBeNull(); // CANNOT assess, never false
    });

    it('returns contested: null when only 1 distinct solution exists', () => {
      const solutions = [
        { v: 1.0, e1: 0.1, e2: -0.1, lim: 0, ref: 'Single Study' },
      ];
      const res = evaluateFieldDispute(solutions);

      expect(res.n).toBe(1);
      expect(res.nAssessable).toBe(1);
      expect(res.contested).toBeNull();
    });

    it('counts limit bounds in nLimit and excludes them from interval overlap comparisons', () => {
      const solutions = [
        { v: 2.0, e1: null, e2: null, lim: 1, ref: 'Upper Bound Study' }, // lim=1 -> upper bound
        { v: 1.0, e1: 0.1, e2: -0.1, lim: 0, ref: 'Direct Study A' },
        { v: 1.05, e1: 0.1, e2: -0.1, lim: 0, ref: 'Direct Study B' },
      ];
      const res = evaluateFieldDispute(solutions);

      expect(res.n).toBe(2); // Only 2 non-bound measurements
      expect(res.nLimit).toBe(1);
      expect(res.nAssessable).toBe(2);
      expect(res.contested).toBe(false); // [0.9, 1.1] overlaps [0.95, 1.15]
    });

    it('counts unknown limit flag (lim === null) in nUnknownLim and prevents marking uncontested', () => {
      const solutions = [
        { v: 1.0, e1: 0.1, e2: -0.1, lim: 0, ref: 'Study A' },
        { v: 1.05, e1: 0.1, e2: -0.1, lim: null, ref: 'Study B' }, // lim null: unknown limit status
      ];
      const res = evaluateFieldDispute(solutions);

      expect(res.n).toBe(2);
      expect(res.nUnknownLim).toBe(1);
      expect(res.contested).toBeNull(); // Cannot claim uncontested with unknown limit
    });
  });

  describe('Extraction & Decoding Helpers', () => {
    it('extracts all 5 DISPUTE fields from raw NASA ps rows honestly', () => {
      const mockPsRows = [
        {
          pl_name: 'TRAPPIST-1 e',
          pl_rade: '0.92',
          pl_radeerr1: '0.08',
          pl_radeerr2: '-0.07',
          pl_radelim: '0',
          pl_bmasse: '0.692',
          pl_bmasseerr1: '0.022',
          pl_bmasseerr2: '-0.022',
          pl_bmasselim: '0',
          pl_orbper: '6.099615',
          pl_orbpererr1: '0.000011',
          pl_orbpererr2: '-0.000011',
          pl_orbperlim: '0',
          pl_eqt: '251',
          pl_eqterr1: '4',
          pl_eqterr2: '-4',
          pl_eqtlim: '0',
          st_teff: '2566',
          st_tefferr1: '26',
          st_tefferr2: '-26',
          st_tefflim: '0',
          pl_refname: 'Gillon et al. 2017',
          st_refname: 'Van Grootel et al. 2018',
          pl_pubdate: '2017-02',
          default_flag: '1',
        },
      ];

      const extracted = extractPlanetSolutions(mockPsRows);
      for (const field of DISPUTE_FIELDS) {
        expect(extracted[field]).toHaveLength(1);
        expect(extracted[field][0].v).toBeGreaterThan(0);
        expect(extracted[field][0].default).toBe(true);
      }
      expect(extracted.pl_rade[0].ref).toBe('Gillon et al. 2017');
      expect(extracted.st_teff[0].ref).toBe('Van Grootel et al. 2018');
    });

    it('decodes compact array representation into full solution objects faithfully', () => {
      const refs = ['Ref A 2020', 'Ref B 2022'];
      const compactSol = [1.25, 0.05, -0.05, 0, 1, '2022-04', 1];

      const decoded = decodeCompactSolution(compactSol, refs);
      expect(decoded).toEqual({
        v: 1.25,
        e1: 0.05,
        e2: -0.05,
        lim: 0,
        ref: 'Ref B 2022',
        pubdate: '2022-04',
        default: true,
      });
    });
  });

  describe('Generated Snapshot Outputs & Coverage (Section 6.5, 7, 13)', () => {
    it('verifies solutions.json exists on disk and obeys the < 8 MB size budget', () => {
      expect(fs.existsSync(solutionsJsonPath)).toBe(true);

      const stat = fs.statSync(solutionsJsonPath);
      expect(stat.size).toBeLessThan(8_000_000); // Architecture budget: < 8 MB
      expect(stat.size).toBeGreaterThan(4_000_000); // Contains all 40,350 solutions

      const rawContent = fs.readFileSync(solutionsJsonPath);
      const gzipBytes = zlib.gzipSync(rawContent).length;
      expect(gzipBytes).toBeLessThan(2_000_000); // Gzip < 2 MB
    });

    it('verifies solutions.json preserves all confirmed planets and exact solution counts', () => {
      const json = JSON.parse(fs.readFileSync(solutionsJsonPath, 'utf8'));

      expect(json.version).toBe(1);
      expect(json.snapshotId).toBe(snapshotId);
      expect(json.fields).toEqual(DISPUTE_FIELDS);
      expect(json.solutionShape).toEqual(['v', 'e1', 'e2', 'lim', 'refIdx', 'pubdate', 'def']);
      expect(Array.isArray(json.refs)).toBe(true);
      expect(json.refs.length).toBeGreaterThan(1000);

      const planetIds = Object.keys(json.planets);
      expect(planetIds.length).toBe(6451); // 100% of confirmed planets

      // Spot check known multi-solution benchmark planet (TRAPPIST-1 e)
      const trappistSols = decodeCompactSolutions(json.planets['trappist-1-e'], json.refs);
      expect(trappistSols.pl_rade.length).toBeGreaterThanOrEqual(2);
      expect(trappistSols.pl_bmasse.length).toBeGreaterThanOrEqual(2);

      // Verify solutions are NOT averaged: each row retains distinct values and refs
      const distinctRadValues = new Set(trappistSols.pl_rade.map((s) => s.v));
      expect(distinctRadValues.size).toBeGreaterThanOrEqual(2);
    });

    it('verifies existing cross-catalog flags remain completely intact and unchanged', () => {
      expect(fs.existsSync(crosscatalogFlagsPath)).toBe(true);

      const flagsData = JSON.parse(fs.readFileSync(crosscatalogFlagsPath, 'utf8'));
      expect(flagsData.meta.snapshotId).toBe(snapshotId);
      expect(flagsData.counts.matched).toBe(5834);
      expect(flagsData.counts.totalNasaPlanets).toBe(6451);
      expect(flagsData.planets['trappist-1-e']).toBeDefined();
    });
  });
});
