"use client";
import { useTransition } from "react";
import { toggleFavorite } from "./actions";

export function FavoriteButton({ propertyId, favorited }: { propertyId: string; favorited: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => toggleFavorite(propertyId))} aria-pressed={favorited}>
      {favorited ? "★ Favorito" : "☆ Favoritar"}
    </button>
  );
}
