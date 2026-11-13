"use client";

import { useState, type ReactNode } from "react";

export function SearchFilters({ children, activeCount }: { children: ReactNode; activeCount: number }) {
  const [open, setOpen] = useState(false);

  return (
    <aside className={`search-filters${open ? " is-open" : ""}`} aria-label="Filtros da busca">
      <div className="filters-heading" aria-hidden="true">Filtrar imóveis</div>
      <button
        type="button"
        className="filters-toggle"
        aria-expanded={open}
        aria-controls="search-filters-form"
        onClick={() => setOpen(!open)}
      >
        <span>Filtrar imóveis{activeCount > 0 && <span className="filter-count">{activeCount} ativos</span>}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <div id="search-filters-form" className="filters-content">{children}</div>
    </aside>
  );
}
