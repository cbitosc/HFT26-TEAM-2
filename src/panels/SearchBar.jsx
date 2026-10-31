/**
 * src/panels/SearchBar.jsx
 * Searches across all 6,451 confirmed planets and 4,847 host stars in the snapshot,
 * including the 28 planets/hosts without 3D sky positions.
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import { applyFilters } from '../../shared/filters.js';
import { useExplorerStore } from '../store/explorerStore.js';
import { PLANET_CLASS_META, formatNumericValue } from '../data/fieldDictionary.js';

export function SearchBar() {
  const snapshot = useExplorerStore((s) => s.snapshot);
  const searchQuery = useExplorerStore((s) => s.searchQuery);
  const setSearchQuery = useExplorerStore((s) => s.setSearchQuery);
  const selectPlanet = useExplorerStore((s) => s.selectPlanet);
  const selectSystem = useExplorerStore((s) => s.selectSystem);

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const results = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !snapshot) {
      return { hosts: [], planets: [], totalPlanetsMatched: 0, totalHostsMatched: 0 };
    }

    const matchedHosts = snapshot.galaxy.filter(
      (h) => h.hostname.toLowerCase().includes(q) || h.systemId.toLowerCase().includes(q)
    );

    const allMatchedPlanets = applyFilters(snapshot.planets, {
      nameQuery: q,
    });

    return {
      hosts: matchedHosts.slice(0, 6),
      planets: allMatchedPlanets.slice(0, 10),
      totalHostsMatched: matchedHosts.length,
      totalPlanetsMatched: allMatchedPlanets.length,
    };
  }, [searchQuery, snapshot]);

  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div className="search-bar-container" ref={containerRef}>
      <div className="search-input-wrap">
        <span className="search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          type="search"
          className="search-input"
          placeholder="Search all 6,451 planets & 4,847 stars (e.g. TRAPPIST-1 e, 51 Peg, G 268-110 b)…"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          aria-label="Search confirmed planets and host stars"
        />
        {hasQuery && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => {
              setSearchQuery('');
              setIsOpen(false);
            }}
            aria-label="Clear search query"
          >
            ×
          </button>
        )}
      </div>

      {isOpen && hasQuery && (
        <div className="search-dropdown" role="listbox" aria-label="Search results">
          {results.hosts.length === 0 && results.planets.length === 0 ? (
            <div className="search-empty">
              No confirmed planets or host stars match &ldquo;{searchQuery.trim()}&rdquo;.
            </div>
          ) : (
            <>
              {results.hosts.length > 0 && (
                <div className="search-group">
                  <div className="search-group-header">
                    Host Stars ({results.totalHostsMatched})
                  </div>
                  {results.hosts.map((host) => (
                    <button
                      key={host.systemId}
                      type="button"
                      className="search-result-item"
                      onClick={() => {
                        selectSystem(host.systemId);
                        setIsOpen(false);
                      }}
                    >
                      <div className="result-main">
                        <span className="result-kind-badge kind-star">Star</span>
                        <span className="result-name">{host.hostname}</span>
                      </div>
                      <div className="result-meta">
                        <span>
                          {host.planetCount} {host.planetCount === 1 ? 'planet' : 'planets'}
                        </span>
                        {host.hasPosition ? (
                          <span className="pos-tag pos-ok">
                            {formatNumericValue(host.syDistPc)} pc
                          </span>
                        ) : (
                          <span className="pos-tag pos-missing" title="Sky coordinates or distance missing in archive">
                            3D pos unknown
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results.planets.length > 0 && (
                <div className="search-group">
                  <div className="search-group-header">
                    Confirmed Planets ({results.totalPlanetsMatched})
                  </div>
                  {results.planets.map((planet) => {
                    const host = snapshot?.hostById.get(planet.systemId);
                    const classMeta =
                      PLANET_CLASS_META[planet.planetClass] || PLANET_CLASS_META.unclassified;
                    const radeVal = planet.fields?.pl_rade?.v ?? null;
                    return (
                      <button
                        key={planet.id}
                        type="button"
                        className="search-result-item"
                        onClick={() => {
                          selectPlanet(planet.id);
                          setIsOpen(false);
                        }}
                      >
                        <div className="result-main">
                          <span className="result-kind-badge kind-planet">Planet</span>
                          <span className="result-name">{planet.name}</span>
                          <span className="result-sub">({planet.hostname})</span>
                        </div>
                        <div className="result-meta">
                          <span className="result-class-pill">{classMeta.label}</span>
                          <span>
                            {radeVal !== null ? `${formatNumericValue(radeVal)} R⊕` : 'R⊕ unknown'}
                          </span>
                          {host && !host.hasPosition && (
                            <span
                              className="pos-tag pos-missing"
                              title="Searchable without 3D sky position"
                            >
                              3D pos unknown
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default SearchBar;
