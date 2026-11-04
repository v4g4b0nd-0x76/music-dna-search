export type FavoriteSignalType = 'artist' | 'tag' | 'category';

export interface FavoritesState {
  favoriteArtists: string[];
  favoriteTags: string[];
  favoriteCategories: string[];
}

export type FavoritesAction =
  | { type: 'HYDRATE'; payload: Partial<FavoritesState> }
  | { type: 'TOGGLE_ARTIST'; artist: string }
  | { type: 'TOGGLE_TAG'; tag: string }
  | { type: 'TOGGLE_CATEGORY'; category: string }
  | { type: 'ADD_SIGNAL'; signalType: FavoriteSignalType; value: string }
  | { type: 'REMOVE_SIGNAL'; signalType: FavoriteSignalType; value: string }
  | { type: 'RESET_DEFAULT' }
  | { type: 'CLEAR_ALL' };

export const EMPTY_FAVORITES_STATE: FavoritesState = {
  favoriteArtists: [],
  favoriteTags: [],
  favoriteCategories: [],
};

export const DEFAULT_FAVORITES_STATE: FavoritesState = {
  favoriteArtists: ['Bicep', 'Khruangbin', 'Overmono'],
  favoriteTags: ['breakbeat', 'psychedelic-funk', 'warm-analog', 'analog-synth'],
  favoriteCategories: ['Electronic', 'Indie & Funk'],
};

/**
 * Normalizes a tag string by stripping leading '#' and converting spaces to hyphens in lowercase.
 */
export function normalizeTagValue(raw: string): string {
  return raw.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
}

/**
 * Pure reducer for managing favorite artists, tags, and categories.
 */
export function favoritesReducer(
  state: FavoritesState,
  action: FavoritesAction
): FavoritesState {
  switch (action.type) {
    case 'HYDRATE': {
      return {
        favoriteArtists: Array.isArray(action.payload.favoriteArtists)
          ? action.payload.favoriteArtists
          : state.favoriteArtists,
        favoriteTags: Array.isArray(action.payload.favoriteTags)
          ? action.payload.favoriteTags.map(normalizeTagValue).filter(Boolean)
          : state.favoriteTags,
        favoriteCategories: Array.isArray(action.payload.favoriteCategories)
          ? action.payload.favoriteCategories
          : state.favoriteCategories,
      };
    }

    case 'TOGGLE_ARTIST': {
      const clean = action.artist.trim();
      if (!clean) return state;
      const exists = state.favoriteArtists.some(
        (a) => a.toLowerCase() === clean.toLowerCase()
      );
      return {
        ...state,
        favoriteArtists: exists
          ? state.favoriteArtists.filter((a) => a.toLowerCase() !== clean.toLowerCase())
          : [...state.favoriteArtists, clean],
      };
    }

    case 'TOGGLE_TAG': {
      const clean = normalizeTagValue(action.tag);
      if (!clean) return state;
      const exists = state.favoriteTags.includes(clean);
      return {
        ...state,
        favoriteTags: exists
          ? state.favoriteTags.filter((t) => t !== clean)
          : [...state.favoriteTags, clean],
      };
    }

    case 'TOGGLE_CATEGORY': {
      const clean = action.category.trim();
      if (!clean) return state;
      const exists = state.favoriteCategories.some(
        (c) => c.toLowerCase() === clean.toLowerCase()
      );
      return {
        ...state,
        favoriteCategories: exists
          ? state.favoriteCategories.filter((c) => c.toLowerCase() !== clean.toLowerCase())
          : [...state.favoriteCategories, clean],
      };
    }

    case 'ADD_SIGNAL': {
      const rawVal = action.value.trim();
      if (!rawVal) return state;

      if (action.signalType === 'artist') {
        const exists = state.favoriteArtists.some(
          (a) => a.toLowerCase() === rawVal.toLowerCase()
        );
        if (exists) return state;
        return {
          ...state,
          favoriteArtists: [...state.favoriteArtists, rawVal],
        };
      }

      if (action.signalType === 'tag') {
        const cleanTag = normalizeTagValue(rawVal);
        if (!cleanTag || state.favoriteTags.includes(cleanTag)) return state;
        return {
          ...state,
          favoriteTags: [...state.favoriteTags, cleanTag],
        };
      }

      const existsCat = state.favoriteCategories.some(
        (c) => c.toLowerCase() === rawVal.toLowerCase()
      );
      if (existsCat) return state;
      return {
        ...state,
        favoriteCategories: [...state.favoriteCategories, rawVal],
      };
    }

    case 'REMOVE_SIGNAL': {
      const rawVal = action.value.trim();
      if (!rawVal) return state;

      if (action.signalType === 'artist') {
        return {
          ...state,
          favoriteArtists: state.favoriteArtists.filter(
            (a) => a.toLowerCase() !== rawVal.toLowerCase()
          ),
        };
      }

      if (action.signalType === 'tag') {
        const cleanTag = normalizeTagValue(rawVal);
        return {
          ...state,
          favoriteTags: state.favoriteTags.filter((t) => t !== cleanTag),
        };
      }

      return {
        ...state,
        favoriteCategories: state.favoriteCategories.filter(
          (c) => c.toLowerCase() !== rawVal.toLowerCase()
        ),
      };
    }

    case 'RESET_DEFAULT':
      return DEFAULT_FAVORITES_STATE;

    case 'CLEAR_ALL':
      return EMPTY_FAVORITES_STATE;

    default:
      return state;
  }
}

/**
 * Serializes FavoritesState to JSON string safely
 */
export function serializeFavoritesState(state: FavoritesState): string {
  return JSON.stringify({
    favoriteArtists: state.favoriteArtists,
    favoriteTags: state.favoriteTags,
    favoriteCategories: state.favoriteCategories,
  });
}

/**
 * Parses a JSON string into a Partial<FavoritesState> safely
 */
export function deserializeFavoritesState(raw: string | null): Partial<FavoritesState> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const result: Partial<FavoritesState> = {};
    if (Array.isArray(parsed.favoriteArtists)) {
      result.favoriteArtists = parsed.favoriteArtists.filter((x: unknown) => typeof x === 'string');
    }
    if (Array.isArray(parsed.favoriteTags)) {
      result.favoriteTags = parsed.favoriteTags
        .filter((x: unknown) => typeof x === 'string')
        .map(normalizeTagValue)
        .filter(Boolean);
    }
    if (Array.isArray(parsed.favoriteCategories)) {
      result.favoriteCategories = parsed.favoriteCategories.filter(
        (x: unknown) => typeof x === 'string'
      );
    }
    return result;
  } catch {
    return null;
  }
}
