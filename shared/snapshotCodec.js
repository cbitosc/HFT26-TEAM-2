/**
 * shared/snapshotCodec.js
 * Lossless compact encoder and decoder for Exoplanet Explorer snapshot files
 * (`galaxy.json` and `planets.json`).
 *
 * Shared by the build pipeline (`scripts/build-snapshot.js`, `scripts/verify-snapshot.js`),
 * server (`/api/helm`), and browser (`src/data/loadSnapshot.js`).
 *
 * Guarantees (DEC-002, DEC-005, DEC-006, DEC-007):
 *   - Missing values (`v`) and missing limit flags (`lim`) always decode to `null`, NEVER `0`.
 *   - `lim === 0` is preserved distinctly from `lim === null`.
 *   - Unavailable or unassessable disputes decode to `disputed: null` and `contested: null`,
 *     NEVER `false` ("uncontested").
 *   - Every raw reference (`{ text, href, raw }`), formula, and `<planetId>.<fieldName>`
 *     input receipt ID is reconstructed identically to the canonical schema.
 */

import { DISPUTE_FIELDS } from './domain/dispute.js';

export const COMPACT_SNAPSHOT_FORMAT = 'exoplanet-snapshot-compact-v1';

const PLANET_FIELD_KEYS = Object.freeze([
  'pl_rade',
  'pl_bmasse',
  'pl_dens',
  'pl_orbper',
  'pl_orbsmax',
  'pl_orbeccen',
  'pl_eqt',
  'pl_insol',
  'st_teff',
  'st_rad',
  'st_mass',
  'st_lum',
  'st_lum_linear',
  'sy_dist',
  'hz_recent_venus',
  'hz_runaway_greenhouse',
  'hz_moist_greenhouse',
  'hz_max_greenhouse',
  'hz_early_mars',
  'completeness',
]);

const HAB_INDICATOR_KEYS = Object.freeze([
  'hzPosition',
  'sizePlausibility',
  'massPlausibility',
  'stellarType',
  'dataCompleteness',
]);

// ─── Galaxy Codec ─────────────────────────────────────────────────────────────

export function encodeGalaxySnapshot(galaxyHosts) {
  return galaxyHosts.map((h) => {
    const out = {
      systemId: h.systemId,
      hostname: h.hostname,
      planetCount: h.planetCount,
      planetIds: h.planetIds,
    };
    if (h.firstDiscYear !== null && h.firstDiscYear !== undefined) {
      out.firstDiscYear = h.firstDiscYear;
    }
    if (h.primaryMethod !== null && h.primaryMethod !== undefined) {
      out.primaryMethod = h.primaryMethod;
    }
    if (h.syDistPc !== null && h.syDistPc !== undefined) {
      out.syDistPc = h.syDistPc;
    }
    if (h.hasPosition) {
      out.hasPosition = true;
      out.posPc = h.posPc;
      out.posDisplay = h.posDisplay;
    }
    if (h.hasDisputedPlanet) {
      out.hasDisputedPlanet = true;
    }
    if (h.hasHzPlanet) {
      out.hasHzPlanet = true;
    }
    return out;
  });
}

export function decodeGalaxySnapshot(rawGalaxy) {
  if (!Array.isArray(rawGalaxy)) {
    throw new Error('Invalid galaxy.json payload: expected array');
  }
  return rawGalaxy.map((h) => ({
    systemId: h.systemId,
    hostname: h.hostname,
    planetCount: h.planetCount,
    planetIds: h.planetIds,
    firstDiscYear: h.firstDiscYear ?? null,
    primaryMethod: h.primaryMethod ?? null,
    syDistPc: h.syDistPc ?? null,
    hasPosition: Boolean(h.hasPosition),
    posPc: h.posPc ?? null,
    posDisplay: h.posDisplay ?? null,
    hasDisputedPlanet: Boolean(h.hasDisputedPlanet),
    hasHzPlanet: Boolean(h.hasHzPlanet),
  }));
}

// ─── Planets Codec (Deduplicated Reference & String Tables + Null Compaction) ─

export function encodePlanetsSnapshot(canonicalPlanets) {
  const refs = [];
  const refMap = new Map();

  const strings = [];
  const stringMap = new Map();

  function internRef(refObj) {
    if (!refObj) return null;
    const key = `${refObj.text ?? ''}\0${refObj.href ?? ''}\0${refObj.raw ?? ''}`;
    if (refMap.has(key)) {
      return refMap.get(key);
    }
    const idx = refs.length;
    const entry = {
      text: refObj.text,
      href: refObj.href ?? null,
    };
    if (refObj.raw !== undefined) {
      entry.raw = refObj.raw;
    }
    refs.push(entry);
    refMap.set(key, idx);
    return idx;
  }

  function internString(str) {
    if (str === null || str === undefined) return null;
    if (stringMap.has(str)) {
      return stringMap.get(str);
    }
    const idx = strings.length;
    strings.push(str);
    stringMap.set(str, idx);
    return idx;
  }

  function stripPlanetPrefix(receiptId, planetId) {
    const prefix = `${planetId}.`;
    return receiptId.startsWith(prefix) ? receiptId.slice(prefix.length) : receiptId;
  }

  const encodedPlanets = canonicalPlanets.map((p) => {
    const prefixId = p.id;

    // Encode fields
    const fieldsOut = {};
    for (const key of PLANET_FIELD_KEYS) {
      const f = p.fields[key];
      const cf = {};
      if (f.v !== null && f.v !== undefined) cf.v = f.v;
      if (f.e1 !== null && f.e1 !== undefined) cf.e1 = f.e1;
      if (f.e2 !== null && f.e2 !== undefined) cf.e2 = f.e2;
      if (f.lim !== null && f.lim !== undefined) cf.lim = f.lim;
      if (f.type && f.type !== 'archive') cf.t = internString(f.type);
      if (f.ref) cf.r = internRef(f.ref);
      if (f.formula !== null && f.formula !== undefined) cf.fn = internString(f.formula);
      if (Array.isArray(f.inputs)) {
        cf.in = f.inputs.map((id) => internString(stripPlanetPrefix(id, prefixId)));
      }
      if (Object.keys(cf).length > 0) {
        fieldsOut[key] = cf;
      }
    }

    // Encode hab indicators
    const habOut = {};
    for (const hk of HAB_INDICATOR_KEYS) {
      const ind = p.hab[hk];
      const ci = {
        s: internString(ind.status),
        l: internString(ind.label),
        c: internString(ind.confidence),
      };
      if (Array.isArray(ind.receipts) && ind.receipts.length > 0) {
        ci.rc = ind.receipts.map((id) => internString(stripPlanetPrefix(id, prefixId)));
      }
      if (ind.note !== null && ind.note !== undefined) {
        ci.n = internString(ind.note);
      }
      habOut[hk] = ci;
    }

    // Encode discovery
    const discOut = {};
    if (p.discovery.method !== null) discOut.m = internString(p.discovery.method);
    if (p.discovery.year !== null) discOut.y = p.discovery.year;
    if (p.discovery.facility !== null) discOut.f = internString(p.discovery.facility);
    if (p.discovery.pubdate !== null) discOut.p = internString(p.discovery.pubdate);
    if (p.discovery.ref !== null) discOut.r = internRef(p.discovery.ref);

    // Encode system
    const sysOut = {};
    if (p.system.starCount !== null) sysOut.s = p.system.starCount;
    if (p.system.planetCount !== null) sysOut.p = p.system.planetCount;
    if (p.system.circumbinary !== null) sysOut.cb = p.system.circumbinary;
    if (p.system.controversialFlag !== null) sysOut.cf = p.system.controversialFlag;
    if (p.system.spectralType !== null) sysOut.sp = internString(p.system.spectralType);
    if (p.system.spectralTypeRef !== null) sysOut.spr = internRef(p.system.spectralTypeRef);
    if (p.system.raDeg !== null) sysOut.ra = p.system.raDeg;
    if (p.system.decDeg !== null) sysOut.dec = p.system.decDeg;
    if (p.system.coordRef !== null) sysOut.cr = internRef(p.system.coordRef);

    const out = {
      id: p.id,
      name: p.name,
      systemId: p.systemId,
      hostname: p.hostname,
      pc: internString(p.planetClass),
      cm: p.completeness,
      d: discOut,
      sy: sysOut,
      f: fieldsOut,
      h: habOut,
    };

    if (p.plLetter !== null) out.pl = p.plLetter;
    if (p.gaiaDr3Id !== null) out.gaia = p.gaiaDr3Id;
    if (p.status !== 'confirmed') out.st = p.status;
    if (p.massProvenance !== null) out.mp = internString(p.massProvenance);
    if (p.massProvenanceLabel !== 'unknown') out.mpl = internString(p.massProvenanceLabel);

    // Only serialize dispute when available === true; when false, decoder restores exact unavailable state
    if (p.dispute && p.dispute.available === true) {
      out.dp = p.dispute;
    }

    return out;
  });

  return {
    format: COMPACT_SNAPSHOT_FORMAT,
    refs,
    strings,
    planets: encodedPlanets,
  };
}

function makeUnavailableDispute() {
  const fields = {};
  for (const fk of DISPUTE_FIELDS) {
    fields[fk] = {
      n: 0,
      nAssessable: 0,
      nLimit: 0,
      nUnknownLim: 0,
      nRefs: 0,
      min: null,
      max: null,
      uncertaintyMissing: false,
      contested: null,
    };
  }
  return {
    available: false,
    disputed: null,
    fields,
  };
}

/**
 * Decodes either a compact `planets.json` object (`{ format, refs, strings, planets }`)
 * or an already-expanded array of canonical `PlanetRecord` objects into the exact
 * canonical `PlanetRecord[]` array.
 */
export function decodePlanetsSnapshot(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || payload.format !== COMPACT_SNAPSHOT_FORMAT || !Array.isArray(payload.planets)) {
    throw new Error('Invalid planets.json payload: expected compact-v1 envelope or PlanetRecord array');
  }

  const { refs, strings, planets } = payload;

  function getRef(idx) {
    if (idx === undefined || idx === null) return null;
    const r = refs[idx];
    if (!r) throw new Error(`Out-of-bounds ref index: ${idx}`);
    return {
      text: r.text,
      href: r.href ?? null,
      ...(r.raw !== undefined ? { raw: r.raw } : {}),
    };
  }

  function getStr(idx) {
    if (idx === undefined || idx === null) return null;
    const s = strings[idx];
    if (s === undefined) throw new Error(`Out-of-bounds string index: ${idx}`);
    return s;
  }

  function expandReceiptId(shortOrFull, planetId) {
    return shortOrFull.includes('.') ? shortOrFull : `${planetId}.${shortOrFull}`;
  }

  return planets.map((cp) => {
    const planetId = cp.id;

    // Reconstruct all 20 canonical Field objects
    const fields = {};
    for (const key of PLANET_FIELD_KEYS) {
      const cf = cp.f?.[key];
      const defaultType =
        key === 'completeness'
          ? 'derived'
          : key === 'st_lum_linear' || key.startsWith('hz_')
            ? 'calculated'
            : 'archive';

      if (!cf) {
        fields[key] = {
          v: null,
          e1: null,
          e2: null,
          lim: null,
          type: defaultType,
          ref: null,
          formula: null,
          inputs: null,
        };
      } else {
        fields[key] = {
          v: cf.v !== undefined ? cf.v : null,
          e1: cf.e1 !== undefined ? cf.e1 : null,
          e2: cf.e2 !== undefined ? cf.e2 : null,
          lim: cf.lim !== undefined ? cf.lim : null,
          type: cf.t !== undefined ? getStr(cf.t) : defaultType,
          ref: cf.r !== undefined ? getRef(cf.r) : null,
          formula: cf.fn !== undefined ? getStr(cf.fn) : null,
          inputs: Array.isArray(cf.in)
            ? cf.in.map((idx) => expandReceiptId(getStr(idx), planetId))
            : null,
        };
      }
    }

    // Reconstruct HAB-LAB
    const hab = {};
    for (const hk of HAB_INDICATOR_KEYS) {
      const ci = cp.h[hk];
      hab[hk] = {
        status: getStr(ci.s),
        label: getStr(ci.l),
        confidence: getStr(ci.c),
        receipts: Array.isArray(ci.rc)
          ? ci.rc.map((idx) => expandReceiptId(getStr(idx), planetId))
          : [],
        note: ci.n !== undefined ? getStr(ci.n) : null,
      };
    }

    const d = cp.d || {};
    const discovery = {
      method: d.m !== undefined ? getStr(d.m) : null,
      year: d.y !== undefined ? d.y : null,
      facility: d.f !== undefined ? getStr(d.f) : null,
      pubdate: d.p !== undefined ? getStr(d.p) : null,
      ref: d.r !== undefined ? getRef(d.r) : null,
    };

    const sy = cp.sy || {};
    const system = {
      starCount: sy.s !== undefined ? sy.s : null,
      planetCount: sy.p !== undefined ? sy.p : null,
      circumbinary: sy.cb !== undefined ? sy.cb : null,
      controversialFlag: sy.cf !== undefined ? sy.cf : null,
      spectralType: sy.sp !== undefined ? getStr(sy.sp) : null,
      spectralTypeRef: sy.spr !== undefined ? getRef(sy.spr) : null,
      raDeg: sy.ra !== undefined ? sy.ra : null,
      decDeg: sy.dec !== undefined ? sy.dec : null,
      coordRef: sy.cr !== undefined ? getRef(sy.cr) : null,
    };

    const dispute = cp.dp ? cp.dp : makeUnavailableDispute();

    return {
      id: planetId,
      name: cp.name,
      systemId: cp.systemId,
      hostname: cp.hostname,
      plLetter: cp.pl !== undefined ? cp.pl : null,
      gaiaDr3Id: cp.gaia !== undefined ? cp.gaia : null,
      status: cp.st !== undefined ? cp.st : 'confirmed',
      discovery,
      system,
      massProvenance: cp.mp !== undefined ? getStr(cp.mp) : null,
      massProvenanceLabel: cp.mpl !== undefined ? getStr(cp.mpl) : 'unknown',
      planetClass: getStr(cp.pc),
      completeness: cp.cm,
      fields,
      hab,
      dispute,
    };
  });
}

