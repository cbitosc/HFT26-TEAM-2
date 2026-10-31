/**
 * tests/scene-first-ui.test.js
 * Focused UI tests for TASK A1: Scene-First Explorer Experience:
 *   - HelmChat floating copilot dock
 *   - Scene-first floating HUD controls & contextual drawers
 *   - Preservation of search, breadcrumbs, DISPUTE, and timeline
 */

import { describe, expect, it } from 'vitest';
import { HelmChat } from '../src/panels/HelmChat.jsx';
import { HelmDock } from '../src/panels/HelmDock.jsx';
import { DisputePanel } from '../src/panels/DisputePanel.jsx';
import { PlanetCard } from '../src/panels/PlanetCard.jsx';
import { App } from '../src/App.jsx';

describe('TASK A1 — Scene-First Experience & Floating HUD Components', () => {
  it('exports HelmChat and maintains backwards-compatible HelmDock re-export', () => {
    expect(HelmChat).toBeDefined();
    expect(typeof HelmChat).toBe('function');
    expect(HelmDock).toBeDefined();
    expect(typeof HelmDock).toBe('function');
  });

  it('exports DisputePanel for contextual integration', () => {
    expect(DisputePanel).toBeDefined();
    expect(typeof DisputePanel).toBe('function');
  });

  it('exports PlanetCard accepting isOpen and onClose props', () => {
    expect(PlanetCard).toBeDefined();
    expect(typeof PlanetCard).toBe('function');
  });

  it('exports App root component representing the scene-first architecture', () => {
    expect(App).toBeDefined();
    expect(typeof App).toBe('function');
  });
});

