/**
 * server/helm/prompts.js
 * System prompt and OpenAI-compatible tool definitions for HELM.
 */

export const HELM_SYSTEM_PROMPT = `You are HELM, an observational astronomer who operates the Team Tetris Exoplanet Explorer exclusively through typed tools.

Non-negotiable rules:
1. Never invent, estimate, round-fill, or type bare digits for scientific measurements. Always emit the exact receipt token {{r:<planetId>.<fieldName>}} returned by tools.
2. When a tool reports a field status as "unknown", state that it is "unknown". Never replace an unknown value with 0 or a typical value.
3. Never declare or imply that any planet is habitable, is uninhabitable, supports life, can support life, or is an Earth-like world. Refer only to the "habitable zone" (conservative or optimistic) and "potential habitability indicators".
4. Never present an unconfirmed candidate as a confirmed planet.
5. When discussing mass, state its provenance label ("measured", "model-estimated", or "minimum-mass lower bound"). When a planet has disputed measurements, mention its dispute status.
6. Mention observational detection-method bias (transit and radial-velocity surveys favour close-in planets around smaller or nearby stars) when discussing discovery counts or habitable-zone populations.
7. Use the UI context's selectedPlanetId only when the user explicitly refers to "this planet" or "current planet".
8. Keep your final answer concise (at most 120 words) after executing the necessary tools.`;

export const HELM_TOOL_DEFINITIONS = Object.freeze([
  {
    type: 'function',
    function: {
      name: 'search_planets',
      description: 'Search and sort confirmed exoplanets in the NASA Exoplanet Archive snapshot.',
      parameters: {
        type: 'object',
        properties: {
          nameQuery: { type: 'string' },
          radiusEarth: {
            type: 'object',
            properties: { min: { type: 'number' }, max: { type: 'number' } },
          },
          massEarth: {
            type: 'object',
            properties: { min: { type: 'number' }, max: { type: 'number' } },
          },
          eqTempK: {
            type: 'object',
            properties: { min: { type: 'number' }, max: { type: 'number' } },
          },
          periodDays: {
            type: 'object',
            properties: { min: { type: 'number' }, max: { type: 'number' } },
          },
          distancePc: {
            type: 'object',
            properties: { min: { type: 'number' }, max: { type: 'number' } },
          },
          discYear: {
            type: 'object',
            properties: { min: { type: 'integer' }, max: { type: 'integer' } },
          },
          method: { type: 'string' },
          hz: { type: 'string', enum: ['in_conservative', 'in_optimistic'] },
          contestedOnly: { type: 'boolean' },
          hasFields: { type: 'array', items: { type: 'string' } },
          sortBy: {
            type: 'string',
            enum: ['distance', 'radius', 'mass', 'eqTemp', 'discYear', 'nSolutions'],
          },
          sortDir: { type: 'string', enum: ['asc', 'desc'] },
          limit: { type: 'integer', minimum: 1, maximum: 10 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_planet',
      description: 'Fetch canonical fields, HAB-LAB indicators, and DISPUTE summary for one planet.',
      parameters: {
        type: 'object',
        properties: {
          planetId: { type: 'string' },
        },
        required: ['planetId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_planets',
      description: 'Compare 2 to 3 planets (or "earth" / "jupiter") and open the comparison panel.',
      parameters: {
        type: 'object',
        properties: {
          planetIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 3,
          },
        },
        required: ['planetIds'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'focus_camera',
      description: 'Move the 3D camera to the galaxy view, a host star system, or a specific planet.',
      parameters: {
        type: 'object',
        properties: {
          targetId: { type: 'string' },
          level: { type: 'string', enum: ['galaxy', 'system', 'planet'] },
        },
        required: ['level'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'highlight',
      description: 'Highlight a set of planets in the 3D scene or clear active highlights.',
      parameters: {
        type: 'object',
        properties: {
          planetIds: { type: 'array', items: { type: 'string' }, maxItems: 50 },
          mode: { type: 'string', enum: ['set', 'clear'] },
        },
        required: ['mode'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_timeline',
      description: 'Set the discovery timeline scrubber to a specific year (1992-2026).',
      parameters: {
        type: 'object',
        properties: {
          throughYear: { type: 'integer', minimum: 1992, maximum: 2026 },
          playing: { type: 'boolean' },
        },
        required: ['throughYear'],
        additionalProperties: false,
      },
    },
  },
]);
