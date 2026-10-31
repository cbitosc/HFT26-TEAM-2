/**
 * shared/schemas.js
 * Single source of truth for runtime contracts (Zod schemas) shared by
 * the data pipeline, Vercel serverless function (/api/helm), and browser.
 *
 * Single-writer file owned by Reviewer / Integrator (AGENTS.md Section 2).
 * Incorporates human-approved decisions DEC-001 through DEC-009.
 */

import { z } from 'zod';

// ─── 1. Field & Provenance Receipts (Section 6.6, DEC-002, DEC-005 Option A) ──

export const FieldTypeSchema = z.enum([
  'archive',
  'archive_calculated',
  'calculated',
  'derived',
  'reference',
]);

export const FieldLimSchema = z.union([z.literal(-1), z.literal(0), z.literal(1)]).nullable();

export const FieldRefSchema = z
  .object({
    text: z.string(),
    href: z.string().nullable(),
    raw: z.string().optional(),
  })
  .nullable();

export const FieldSchema = z
  .object({
    v: z.number().finite().nullable(),
    e1: z.number().finite().nullable(),
    e2: z.number().finite().nullable(),
    lim: FieldLimSchema,
    type: FieldTypeSchema,
    ref: FieldRefSchema,
    formula: z.string().nullable(),
    inputs: z.array(z.string().min(1)).nullable(),
  })
  .superRefine((field, ctx) => {
    // Calculated and derived fields with a non-null value must list their input receipts.
    if ((field.type === 'calculated' || field.type === 'derived') && field.v !== null) {
      if (!Array.isArray(field.inputs) || field.inputs.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Field with type="${field.type}" and non-null value must provide non-empty inputs[]`,
          path: ['inputs'],
        });
      }
    }
    // DEC-005 Option A: archive_calculated preserves raw reference and keeps unknown NASA inputs null.
    if (field.type === 'archive_calculated' && field.inputs !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Field with type="archive_calculated" must keep unknown NASA inputs as null (DEC-005)',
        path: ['inputs'],
      });
    }
  });

// ─── 2. HAB-LAB Checklist (Section 6.4, DEC-003, DEC-006 — No Verdict Ever) ───

export const HabConfidenceSchema = z.enum(['high', 'medium', 'low', 'unknown']);

export const HzStatusSchema = z.enum([
  'in_conservative',
  'in_optimistic_only',
  'outside_inner',
  'outside_outer',
  'unknown',
]);

export const HabIndicatorSchema = z.object({
  status: z.string().min(1),
  label: z.string().min(1),
  confidence: HabConfidenceSchema,
  receipts: z.array(z.string().min(1)),
  note: z.string().nullable().optional(),
});

export const HabLabSchema = z.object({
  hzPosition: HabIndicatorSchema.extend({ status: HzStatusSchema }),
  sizePlausibility: HabIndicatorSchema,
  massPlausibility: HabIndicatorSchema,
  stellarType: HabIndicatorSchema,
  dataCompleteness: HabIndicatorSchema,
});

// ─── 3. DISPUTE Summary (Section 6.5, DEC-007) ────────────────────────────────

export const DisputeFieldSummarySchema = z.object({
  n: z.number().int().nonnegative(),
  nAssessable: z.number().int().nonnegative(),
  nLimit: z.number().int().nonnegative(),
  nUnknownLim: z.number().int().nonnegative(),
  nRefs: z.number().int().nonnegative(),
  min: z.number().finite().nullable(),
  max: z.number().finite().nullable(),
  uncertaintyMissing: z.boolean(),
  contested: z.boolean().nullable(),
});

export const DisputeSummarySchema = z.object({
  available: z.boolean(),
  disputed: z.boolean().nullable(),
  fields: z.record(z.string(), DisputeFieldSummarySchema),
});

// ─── 4. Planet & Galaxy Records (Section 6.2, 6.3, 6.6) ──────────────────────

export const PlanetClassSchema = z.enum([
  'rocky',
  'sub_neptune',
  'gas_giant',
  'hot_lava',
  'icy',
  'unclassified',
]);

export const MassProvenanceSchema = z
  .enum(['Mass', 'M-R relationship', 'Msini', 'Msin(i)/sin(i)'])
  .nullable();

export const MassProvenanceLabelSchema = z.enum([
  'measured',
  'model-estimated',
  'minimum-mass lower bound',
  'inclination-corrected estimate',
  'unknown',
]);

export const PlanetFieldsSchema = z.object({
  pl_rade: FieldSchema,
  pl_bmasse: FieldSchema,
  pl_dens: FieldSchema,
  pl_orbper: FieldSchema,
  pl_orbsmax: FieldSchema,
  pl_orbeccen: FieldSchema,
  pl_eqt: FieldSchema,
  pl_insol: FieldSchema,
  st_teff: FieldSchema,
  st_rad: FieldSchema,
  st_mass: FieldSchema,
  st_lum: FieldSchema,
  st_lum_linear: FieldSchema,
  sy_dist: FieldSchema,
  hz_recent_venus: FieldSchema,
  hz_runaway_greenhouse: FieldSchema,
  hz_moist_greenhouse: FieldSchema,
  hz_max_greenhouse: FieldSchema,
  hz_early_mars: FieldSchema,
  completeness: FieldSchema,
});

export const PlanetRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  systemId: z.string().min(1),
  hostname: z.string().min(1),
  plLetter: z.string().nullable(),
  gaiaDr3Id: z.string().nullable(),
  status: z.enum(['confirmed', 'candidate']),
  discovery: z.object({
    method: z.string().nullable(),
    year: z.number().int().nullable(),
    facility: z.string().nullable(),
    pubdate: z.string().nullable(),
    ref: FieldRefSchema,
  }),
  system: z.object({
    starCount: z.number().int().nullable(),
    planetCount: z.number().int().nullable(),
    circumbinary: z.boolean().nullable(),
    controversialFlag: z.boolean().nullable(),
    spectralType: z.string().nullable(),
    spectralTypeRef: FieldRefSchema,
    raDeg: z.number().finite().nullable(),
    decDeg: z.number().finite().nullable(),
    coordRef: FieldRefSchema,
  }),
  massProvenance: MassProvenanceSchema,
  massProvenanceLabel: MassProvenanceLabelSchema,
  planetClass: PlanetClassSchema,
  completeness: z.number().min(0).max(1),
  fields: PlanetFieldsSchema,
  hab: HabLabSchema,
  dispute: DisputeSummarySchema,
});

export const Vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

export const GalaxyHostSchema = z.object({
  systemId: z.string().min(1),
  hostname: z.string().min(1),
  planetCount: z.number().int().positive(),
  planetIds: z.array(z.string().min(1)).min(1),
  firstDiscYear: z.number().int().nullable(),
  primaryMethod: z.string().nullable(),
  syDistPc: z.number().finite().nullable(),
  hasPosition: z.boolean(),
  posPc: Vec3Schema.nullable(),
  posDisplay: Vec3Schema.nullable(),
  hasDisputedPlanet: z.boolean(),
  hasHzPlanet: z.boolean(),
});

// ─── 5. Snapshot Manifest & Latest Pointer (Section 6.6, DEC-002) ─────────────

export const SnapshotIdRegex = /^\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/;

export const ManifestSourceSchema = z.object({
  name: z.string().min(1),
  doi: z.string().nullable().optional(),
  urlOrPath: z.string().min(1),
  rawCsvPath: z.string().nullable().optional(),
  rawCsvSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable().optional(),
  rawCsvBytes: z.number().int().nonnegative().nullable().optional(),
  rowCount: z.number().int().nonnegative(),
});

export const ManifestSchema = z.object({
  snapshotId: z.string().regex(SnapshotIdRegex),
  fetchedAt: z.string().nullable(),
  latestRowUpdate: z.string().nullable(),
  headerTimestampRaw: z.string().nullable(),
  sources: z.array(ManifestSourceSchema).min(1),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  columnWhitelistHash: z.string().regex(/^[0-9a-f]{64}$/),
  counts: z.object({
    planets: z.number().int().nonnegative(),
    hosts: z.number().int().nonnegative(),
    hostsWithPosition: z.number().int().nonnegative(),
    planetsWithPosition: z.number().int().nonnegative(),
    withSolutions: z.number().int().nonnegative(),
  }),
  fileSizes: z.record(z.string(), z.number().int().nonnegative()),
});

export const LatestSnapshotPointerSchema = z.object({
  snapshotId: z.string().regex(SnapshotIdRegex),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  manifestPath: z.string().min(1),
});

// ─── 6. Shared Filter & HELM Tool / Action Schemas (Section 8.2–8.4) ─────────

export const NumericRangeSchema = z
  .object({
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .strict()
  .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, {
    message: 'Range min must be <= max',
  });

export const PlanetFiltersSchema = z
  .object({
    nameQuery: z.string().max(120).optional(),
    radiusEarth: NumericRangeSchema.optional(),
    massEarth: NumericRangeSchema.optional(),
    eqTempK: NumericRangeSchema.optional(),
    periodDays: NumericRangeSchema.optional(),
    distancePc: z
      .object({
        min: z.number().finite().nonnegative().optional(),
        max: z.number().finite().positive().optional(),
      })
      .strict()
      .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, {
        message: 'Range min must be <= max',
      })
      .optional(),
    discYear: z
      .object({
        min: z.number().int().min(1980).max(2030).optional(),
        max: z.number().int().min(1980).max(2030).optional(),
      })
      .strict()
      .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, {
        message: 'Range min must be <= max',
      })
      .optional(),
    method: z.string().max(80).optional(),
    hz: z.enum(['in_conservative', 'in_optimistic']).optional(),
    contestedOnly: z.boolean().optional(),
    hasFields: z.array(z.string().min(1)).max(20).optional(),
    sortBy: z
      .enum(['distance', 'radius', 'mass', 'eqTemp', 'discYear', 'nSolutions'])
      .optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
    limit: z.number().int().min(1).max(10).optional(),
  })
  .strict();

export const GetPlanetToolArgsSchema = z
  .object({
    planetId: z.string().min(1).max(120),
  })
  .strict();

export const ComparePlanetsToolArgsSchema = z
  .object({
    planetIds: z.array(z.string().min(1).max(120)).min(2).max(3),
  })
  .strict();

export const FocusCameraToolArgsSchema = z
  .object({
    targetId: z.string().min(1).max(120).optional(),
    level: z.enum(['galaxy', 'system', 'planet']),
  })
  .strict()
  .refine(
    (val) =>
      val.level === 'galaxy' || (typeof val.targetId === 'string' && val.targetId.trim().length > 0),
    {
      message: 'targetId is required when level is system or planet',
      path: ['targetId'],
    }
  );

export const HighlightToolArgsSchema = z
  .object({
    planetIds: z.array(z.string().min(1).max(120)).max(50).optional(),
    mode: z.enum(['set', 'clear']),
  })
  .strict()
  .refine(
    (val) => val.mode === 'clear' || (Array.isArray(val.planetIds) && val.planetIds.length > 0),
    {
      message: 'planetIds must be a non-empty array when mode is set',
      path: ['planetIds'],
    }
  );

export const OpenTimelineToolArgsSchema = z
  .object({
    throughYear: z.number().int().min(1992).max(2026),
    playing: z.boolean().optional(),
  })
  .strict();

export const ToolArgumentSchemasByName = Object.freeze({
  search_planets: PlanetFiltersSchema,
  get_planet: GetPlanetToolArgsSchema,
  compare_planets: ComparePlanetsToolArgsSchema,
  focus_camera: FocusCameraToolArgsSchema,
  highlight: HighlightToolArgsSchema,
  open_timeline: OpenTimelineToolArgsSchema,
});

export const HelmActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('focus'),
    targetId: z.string().nullable().optional(),
    level: z.enum(['galaxy', 'system', 'planet']),
  }),
  z.object({
    type: z.literal('highlight'),
    ids: z.array(z.string()),
    mode: z.enum(['set', 'clear']),
  }),
  z.object({
    type: z.literal('timeline'),
    year: z.number().int().min(1992).max(2026),
    playing: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('open_compare'),
    ids: z.array(z.string()).min(2).max(3),
  }),
  z.object({
    type: z.literal('select'),
    id: z.string().nullable(),
  }),
]);

export const HelmSegmentSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('text'), v: z.string() }),
  z.object({ t: z.literal('receipt'), id: z.string().min(1) }),
]);

export const HelmRequestSchema = z
  .object({
    message: z.string().min(1).max(500),
    history: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          text: z.string().max(1500),
        })
      )
      .max(4)
      .optional(),
    ui: z
      .object({
        viewLevel: z.enum(['galaxy', 'system', 'planet']),
        selectedPlanetId: z.string().nullable(),
        timelineYear: z.number().int().min(1980).max(2030),
      })
      .optional(),
  })
  .strict();

export const HelmResponseSchema = z.object({
  segments: z.array(HelmSegmentSchema),
  actions: z.array(HelmActionSchema),
  meta: z.object({
    snapshotId: z.string(),
    model: z.string(),
    source: z.enum(['ai', 'canned', 'fallback']),
    notice: z.string().nullable(),
  }),
});
