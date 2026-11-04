'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  FavoritesState,
  FavoriteSignalType,
  DEFAULT_FAVORITES_STATE,
  favoritesReducer,
  serializeFavoritesState,
  deserializeFavoritesState,
  normalizeTagValue,
} from '@/lib/favorites-store';

export const FAVORITES_SESSION_KEY = 'cratedig_favorites_session_v1';
export const FAVORITES_LOCAL_KEY = 'cratedig_favorites_local_v1';
export const LEGACY_STORAGE_KEY = 'cratedig_yt_state_v1';

export interface FavoritesContextValue extends FavoritesState {
  isHydrated: boolean;
  toggleFavoriteArtist: (artist: string) => void;
  toggleFavoriteTag: (tag: string) => void;
  toggleFavoriteCategory: (category: string) => void;
  addFavoriteSignal: (signalType: FavoriteSignalType, value: string) => void;
  removeFavoriteSignal: (signalType: FavoriteSignalType, value: string) => void;
  hydrateFavorites: (payload: Partial<FavoritesState>) => void;
  resetFavoritesToDefault: () => void;
  isArtistFavorite: (artist: string) => boolean;
  isTagFavorite: (tag: string) => boolean;
  isCategoryFavorite: (category: string) => boolean;
}

const FavoritesContext = createContext<FavoritesContextValue | undefined>(undefined);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(favoritesReducer, DEFAULT_FAVORITES_STATE);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate on mount from sessionStorage first (session persistence), falling back to localStorage
  useEffect(() => {
    try {
      const sessionRaw =
        typeof window !== 'undefined' ? window.sessionStorage.getItem(FAVORITES_SESSION_KEY) : null;
      const localRaw =
        typeof window !== 'undefined' ? window.localStorage.getItem(FAVORITES_LOCAL_KEY) : null;
      const legacyRaw =
        typeof window !== 'undefined' ? window.localStorage.getItem(LEGACY_STORAGE_KEY) : null;

      const hydrated =
        deserializeFavoritesState(sessionRaw) ||
        deserializeFavoritesState(localRaw) ||
        deserializeFavoritesState(legacyRaw);

      if (hydrated && (hydrated.favoriteArtists || hydrated.favoriteTags || hydrated.favoriteCategories)) {
        dispatch({ type: 'HYDRATE', payload: hydrated });
      }
    } catch {
      // ignore storage access errors
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Sync changes to both sessionStorage and localStorage once hydrated
  useEffect(() => {
    if (!isHydrated) return;
    try {
      const serialized = serializeFavoritesState(state);
      window.sessionStorage.setItem(FAVORITES_SESSION_KEY, serialized);
      window.localStorage.setItem(FAVORITES_LOCAL_KEY, serialized);

      // Also keep legacy bundle key updated if present
      const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw);
        window.localStorage.setItem(
          LEGACY_STORAGE_KEY,
          JSON.stringify({
            ...parsed,
            favoriteArtists: state.favoriteArtists,
            favoriteTags: state.favoriteTags,
            favoriteCategories: state.favoriteCategories,
          })
        );
      }
    } catch {
      // ignore storage write errors
    }
  }, [state, isHydrated]);

  const toggleFavoriteArtist = useCallback((artist: string) => {
    dispatch({ type: 'TOGGLE_ARTIST', artist });
  }, []);

  const toggleFavoriteTag = useCallback((tag: string) => {
    dispatch({ type: 'TOGGLE_TAG', tag });
  }, []);

  const toggleFavoriteCategory = useCallback((category: string) => {
    dispatch({ type: 'TOGGLE_CATEGORY', category });
  }, []);

  const addFavoriteSignal = useCallback((signalType: FavoriteSignalType, value: string) => {
    dispatch({ type: 'ADD_SIGNAL', signalType, value });
  }, []);

  const removeFavoriteSignal = useCallback((signalType: FavoriteSignalType, value: string) => {
    dispatch({ type: 'REMOVE_SIGNAL', signalType, value });
  }, []);

  const hydrateFavorites = useCallback((payload: Partial<FavoritesState>) => {
    dispatch({ type: 'HYDRATE', payload });
  }, []);

  const resetFavoritesToDefault = useCallback(() => {
    dispatch({ type: 'RESET_DEFAULT' });
  }, []);

  const isArtistFavorite = useCallback(
    (artist: string) =>
      state.favoriteArtists.some((a) => a.toLowerCase() === artist.trim().toLowerCase()),
    [state.favoriteArtists]
  );

  const isTagFavorite = useCallback(
    (tag: string) => state.favoriteTags.includes(normalizeTagValue(tag)),
    [state.favoriteTags]
  );

  const isCategoryFavorite = useCallback(
    (category: string) =>
      state.favoriteCategories.some((c) => c.toLowerCase() === category.trim().toLowerCase()),
    [state.favoriteCategories]
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      ...state,
      isHydrated,
      toggleFavoriteArtist,
      toggleFavoriteTag,
      toggleFavoriteCategory,
      addFavoriteSignal,
      removeFavoriteSignal,
      hydrateFavorites,
      resetFavoritesToDefault,
      isArtistFavorite,
      isTagFavorite,
      isCategoryFavorite,
    }),
    [
      state,
      isHydrated,
      toggleFavoriteArtist,
      toggleFavoriteTag,
      toggleFavoriteCategory,
      addFavoriteSignal,
      removeFavoriteSignal,
      hydrateFavorites,
      resetFavoritesToDefault,
      isArtistFavorite,
      isTagFavorite,
      isCategoryFavorite,
    ]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return ctx;
}
