export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  tags: string[];
  category: string;
  durationSec: number;
  bpm: number;
  energy: number; // 0-100
  year: number;
  youtubeId?: string;
  youtubeUrl: string;
  ytDlpQuery: string;
  source: 'YouTube Feed' | 'MusicBrainz' | 'iTunes Catalog' | 'Taste Engine' | 'Custom Seed';
  previewAudioUrl?: string;
  matchScore?: number;
  matchReasons?: string[];
}

export interface TasteProfile {
  favoriteArtists: string[];
  favoriteTags: string[];
  favoriteCategories: string[];
  extractedArtists: { name: string; count: number }[];
  extractedTags: { name: string; count: number }[];
  extractedCategories: { name: string; count: number }[];
  targetBpmRange: [number, number];
  targetEnergyRange: [number, number];
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  trackIds: string[];
}

export type YtDlpCookieSource = 'browser' | 'file' | 'none';

export type YtDlpCookieBrowser =
  | 'chrome'
  | 'firefox'
  | 'brave'
  | 'edge'
  | 'safari'
  | 'chromium'
  | 'vivaldi';

export type YouTubeFeedTarget =
  | ':ytrec'
  | ':ytfav'
  | ':ythistory'
  | ':ytwatchlater'
  | 'https://music.youtube.com/playlist?list=LM';

export interface YtDlpFeedCookieConfig {
  cookieSource: YtDlpCookieSource;
  cookieBrowser: YtDlpCookieBrowser;
  cookieProfile: string;
  cookieFilePath: string;
  feedTarget: YouTubeFeedTarget;
  feedLimit: number;
  outputMode: 'print-stdout' | 'export-file' | 'dump-json' | 'direct-audio';
  musicOnlyFilter?: boolean;
  strictMusicCategory?: boolean;
  maxDurationSec?: number;
}

export interface YtDlpOptions {
  format: 'mp3' | 'flac' | 'opus' | 'm4a' | 'mp4-video';
  audioQuality: '0' | '5' | '320K' | '192K';
  embedThumbnail: boolean;
  embedMetadata: boolean;
  addSubtitles: boolean;
  sponsorBlock: boolean;
  outputTemplate: string;
  useSearchFallback: boolean;
  batchFileMode: boolean;
  cookieSource?: YtDlpCookieSource;
  cookieBrowser?: YtDlpCookieBrowser;
  cookieProfile?: string;
  cookieFilePath?: string;
  musicOnlyFilter?: boolean;
  maxDurationSec?: number;
}

export type AlgorithmMode = 'hybrid-affinity' | 'deep-cuts' | 'high-tempo-sonic' | 'tag-cluster';

export const SEED_YOUTUBE_FEED_SAMPLE = `https://www.youtube.com/watch?v=5qap5aO4i9A - Bicep - Glue (Official Music Video) [Electronic / Breakbeat]
https://www.youtube.com/watch?v=2Y6Nne8RvaA - Khruangbin - Time (You and I) [Psychedelic Funk / Indie]
https://www.youtube.com/watch?v=pFptt7Cargc - Tame Impala - Let It Happen [Psychedelic Rock / Synthpop]
https://www.youtube.com/watch?v=8GW6sLrK40k - HOME - Resonance [Synthwave / Chillwave]
https://www.youtube.com/watch?v=c1f7eZ8c1u4 - Floating Points - Bias [IDM / Leftfield Electronic]
https://www.youtube.com/watch?v=4NRXx6U8ABQ - Bonobo - Kerala [Downtempo / Nu-Jazz]
https://www.youtube.com/watch?v=E7wJTI-1dvQ - Four Tet - Baby [Microhouse / Folktronica]`;

export const COOKIE_FEED_SIMULATION_SAMPLES: Record<YouTubeFeedTarget, string> = {
  ':ytrec': `{"id":"5qap5aO4i9A","webpage_url":"https://www.youtube.com/watch?v=5qap5aO4i9A","uploader":"Bicep - Topic","title":"Bicep - Glue","duration":269}
{"id":"overmono01","webpage_url":"https://www.youtube.com/watch?v=overmono01","uploader":"Overmono - Topic","title":"Good Lies","duration":231}
{"id":"WjNssGX04I4","webpage_url":"https://www.youtube.com/watch?v=WjNssGX04I4","uploader":"Jamie xx","title":"Jamie xx - Gosh","duration":291}
{"id":"c1f7eZ8c1u4","webpage_url":"https://www.youtube.com/watch?v=c1f7eZ8c1u4","uploader":"Floating Points - Topic","title":"Bias","duration":307}
{"id":"E7wJTI-1dvQ","webpage_url":"https://www.youtube.com/watch?v=E7wJTI-1dvQ","uploader":"Four Tet - Topic","title":"Baby","duration":264}`,
  ':ytfav': `https://www.youtube.com/watch?v=2Y6Nne8RvaA - Khruangbin - Topic - Time (You and I)
https://www.youtube.com/watch?v=pFptt7Cargc - Tame Impala - Topic - Let It Happen
https://www.youtube.com/watch?v=2x9mfgUsIis - Parcels - Topic - Overnight
https://www.youtube.com/watch?v=WF34N4gJAKE - Bonobo - Topic - Cirrus`,
  ':ythistory': `https://www.youtube.com/watch?v=Nevnq7MvVTI - Aphex Twin - Topic - Xtal
https://www.youtube.com/watch?v=8GW6sLrK40k - HOME - Topic - Resonance
https://www.youtube.com/watch?v=yergWdn968o - Com Truise - Topic - Brokendate
https://www.youtube.com/watch?v=ziAqB9nb_To - Tycho - Topic - Awake`,
  ':ytwatchlater': `https://www.youtube.com/watch?v=BqnG_Ei35JE - Crumb - Topic - Locket
https://www.youtube.com/watch?v=IJrKlSkxRHA - Unknown Mortal Orchestra - Topic - Hunnybee
https://www.youtube.com/watch?v=BI2Et19vDCM - Caribou - Topic - Can't Do Without You`,
  'https://music.youtube.com/playlist?list=LM': `https://www.youtube.com/watch?v=5qap5aO4i9A - Bicep - Topic - Glue
https://www.youtube.com/watch?v=Govnb911120 - Bicep - Topic - Apricots
https://www.youtube.com/watch?v=4NRXx6U8ABQ - Bonobo - Topic - Kerala
https://www.youtube.com/watch?v=2Y6Nne8RvaA - Khruangbin - Topic - Time (You and I)`,
};

export const CURATED_CATALOG: MusicTrack[] = [
  // Seed Feed Tracks
  {
    id: 'trk-bicep-glue',
    title: 'Glue',
    artist: 'Bicep',
    album: 'Bicep',
    tags: ['breakbeat', 'uk-garage', 'melodic-electronic', 'rave-nostalgia'],
    category: 'Electronic',
    durationSec: 269,
    bpm: 130,
    energy: 82,
    year: 2017,
    youtubeId: '5qap5aO4i9A',
    youtubeUrl: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
    ytDlpQuery: 'ytsearch1:"Bicep - Glue Official Audio"',
    source: 'YouTube Feed',
  },
  {
    id: 'trk-khruangbin-time',
    title: 'Time (You and I)',
    artist: 'Khruangbin',
    album: 'Mordechai',
    tags: ['psychedelic-funk', 'thai-funk', 'warm-analog', 'groovy'],
    category: 'Indie & Funk',
    durationSec: 342,
    bpm: 112,
    energy: 68,
    year: 2020,
    youtubeId: '2Y6Nne8RvaA',
    youtubeUrl: 'https://www.youtube.com/watch?v=2Y6Nne8RvaA',
    ytDlpQuery: 'ytsearch1:"Khruangbin - Time (You and I)"',
    source: 'YouTube Feed',
  },
  {
    id: 'trk-tame-letithappen',
    title: 'Let It Happen',
    artist: 'Tame Impala',
    album: 'Currents',
    tags: ['psychedelic-pop', 'synth-rock', 'filter-disco', 'hypnotic'],
    category: 'Psychedelic Rock',
    durationSec: 467,
    bpm: 125,
    energy: 85,
    year: 2015,
    youtubeId: 'pFptt7Cargc',
    youtubeUrl: 'https://www.youtube.com/watch?v=pFptt7Cargc',
    ytDlpQuery: 'ytsearch1:"Tame Impala - Let It Happen"',
    source: 'YouTube Feed',
  },
  {
    id: 'trk-home-resonance',
    title: 'Resonance',
    artist: 'HOME',
    album: 'Odyssey',
    tags: ['synthwave', 'chillwave', 'analog-synth', 'nostalgic'],
    category: 'Synthwave & Chill',
    durationSec: 212,
    bpm: 100,
    energy: 54,
    year: 2014,
    youtubeId: '8GW6sLrK40k',
    youtubeUrl: 'https://www.youtube.com/watch?v=8GW6sLrK40k',
    ytDlpQuery: 'ytsearch1:"HOME - Resonance"',
    source: 'YouTube Feed',
  },
  {
    id: 'trk-fp-bias',
    title: 'Bias',
    artist: 'Floating Points',
    album: 'Crush',
    tags: ['idm', 'leftfield-electronic', 'modular-synth', 'breakbeat'],
    category: 'Electronic',
    durationSec: 307,
    bpm: 132,
    energy: 78,
    year: 2019,
    youtubeId: 'c1f7eZ8c1u4',
    youtubeUrl: 'https://www.youtube.com/watch?v=c1f7eZ8c1u4',
    ytDlpQuery: 'ytsearch1:"Floating Points - Bias"',
    source: 'YouTube Feed',
  },
  {
    id: 'trk-bonobo-kerala',
    title: 'Kerala',
    artist: 'Bonobo',
    album: 'Migration',
    tags: ['downtempo', 'nu-jazz', 'uk-electronic', 'organic-house'],
    category: 'Downtempo & Jazz',
    durationSec: 237,
    bpm: 123,
    energy: 74,
    year: 2017,
    youtubeId: '4NRXx6U8ABQ',
    youtubeUrl: 'https://www.youtube.com/watch?v=4NRXx6U8ABQ',
    ytDlpQuery: 'ytsearch1:"Bonobo - Kerala"',
    source: 'YouTube Feed',
  },
  {
    id: 'trk-fourtet-baby',
    title: 'Baby',
    artist: 'Four Tet',
    album: 'Sixteen Oceans',
    tags: ['microhouse', 'folktronica', 'uk-electronic', 'melodic-electronic'],
    category: 'Electronic',
    durationSec: 264,
    bpm: 126,
    energy: 72,
    year: 2020,
    youtubeId: 'E7wJTI-1dvQ',
    youtubeUrl: 'https://www.youtube.com/watch?v=E7wJTI-1dvQ',
    ytDlpQuery: 'ytsearch1:"Four Tet - Baby"',
    source: 'YouTube Feed',
  },

  // Discovery Pool Tracks (Taste Engine, MusicBrainz, iTunes Cross-Referenced)
  {
    id: 'trk-bicep-apricots',
    title: 'Apricots',
    artist: 'Bicep',
    album: 'Isles',
    tags: ['breakbeat', 'uk-garage', 'melodic-electronic', 'euphoric'],
    category: 'Electronic',
    durationSec: 246,
    bpm: 131,
    energy: 80,
    year: 2021,
    youtubeId: 'Govnb911120',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Bicep+-+Apricots',
    ytDlpQuery: 'ytsearch1:"Bicep - Apricots Official"',
    source: 'Taste Engine',
  },
  {
    id: 'trk-overmono-goodlies',
    title: 'Good Lies',
    artist: 'Overmono',
    album: 'Good Lies',
    tags: ['breakbeat', 'uk-garage', 'leftfield-electronic', 'rave-nostalgia'],
    category: 'Electronic',
    durationSec: 231,
    bpm: 134,
    energy: 86,
    year: 2023,
    youtubeId: 'overmono01',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Overmono+-+Good+Lies',
    ytDlpQuery: 'ytsearch1:"Overmono - Good Lies"',
    source: 'Taste Engine',
  },
  {
    id: 'trk-jamie-gosh',
    title: 'Gosh',
    artist: 'Jamie xx',
    album: 'In Colour',
    tags: ['uk-garage', 'breakbeat', 'leftfield-electronic', 'modular-synth'],
    category: 'Electronic',
    durationSec: 291,
    bpm: 124,
    energy: 88,
    year: 2015,
    youtubeId: 'WjNssGX04I4',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Jamie+xx+-+Gosh',
    ytDlpQuery: 'ytsearch1:"Jamie xx - Gosh"',
    source: 'MusicBrainz',
  },
  {
    id: 'trk-khruangbin-mariella',
    title: 'Mariella',
    artist: 'Khruangbin & Leon Bridges',
    album: 'Texas Moon',
    tags: ['psychedelic-funk', 'warm-analog', 'soul-rock', 'downtempo'],
    category: 'Indie & Funk',
    durationSec: 310,
    bpm: 94,
    energy: 52,
    year: 2022,
    youtubeId: 'khruang02',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Khruangbin+Leon+Bridges+Mariella',
    ytDlpQuery: 'ytsearch1:"Khruangbin Leon Bridges - Mariella"',
    source: 'Taste Engine',
  },
  {
    id: 'trk-locket-crumb',
    title: 'Locket',
    artist: 'Crumb',
    album: 'Locket EP',
    tags: ['psychedelic-pop', 'indie-jazz', 'hypnotic', 'warm-analog'],
    category: 'Psychedelic Rock',
    durationSec: 318,
    bpm: 108,
    energy: 60,
    year: 2017,
    youtubeId: 'BqnG_Ei35JE',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Crumb+-+Locket',
    ytDlpQuery: 'ytsearch1:"Crumb - Locket"',
    source: 'MusicBrainz',
  },
  {
    id: 'trk-unknownmortal-hunnybee',
    title: 'Hunnybee',
    artist: 'Unknown Mortal Orchestra',
    album: 'Sex & Food',
    tags: ['psychedelic-funk', 'groovy', 'warm-analog', 'psychedelic-pop'],
    category: 'Indie & Funk',
    durationSec: 268,
    bpm: 116,
    energy: 65,
    year: 2018,
    youtubeId: 'IJrKlSkxRHA',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Unknown+Mortal+Orchestra+-+Hunnybee',
    ytDlpQuery: 'ytsearch1:"Unknown Mortal Orchestra - Hunnybee"',
    source: 'iTunes Catalog',
  },
  {
    id: 'trk-comtruse-brokendate',
    title: 'Brokendate',
    artist: 'Com Truise',
    album: 'Galactic Melt',
    tags: ['synthwave', 'chillwave', 'analog-synth', 'nostalgic'],
    category: 'Synthwave & Chill',
    durationSec: 306,
    bpm: 98,
    energy: 58,
    year: 2011,
    youtubeId: 'yergWdn968o',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Com+Truise+-+Brokendate',
    ytDlpQuery: 'ytsearch1:"Com Truise - Brokendate"',
    source: 'Taste Engine',
  },
  {
    id: 'trk-tycho-awake',
    title: 'Awake',
    artist: 'Tycho',
    album: 'Awake',
    tags: ['chillwave', 'downtempo', 'analog-synth', 'post-rock'],
    category: 'Synthwave & Chill',
    durationSec: 283,
    bpm: 122,
    energy: 66,
    year: 2014,
    youtubeId: 'ziAqB9nb_To',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Tycho+-+Awake',
    ytDlpQuery: 'ytsearch1:"Tycho - Awake"',
    source: 'MusicBrainz',
  },
  {
    id: 'trk-caribou-cantdo',
    title: "Can't Do Without You",
    artist: 'Caribou',
    album: 'Our Love',
    tags: ['melodic-electronic', 'microhouse', 'hypnotic', 'uk-electronic'],
    category: 'Electronic',
    durationSec: 236,
    bpm: 123,
    energy: 79,
    year: 2014,
    youtubeId: 'BI2Et19vDCM',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Caribou+-+Cant+Do+Without+You',
    ytDlpQuery: 'ytsearch1:"Caribou - Can\'t Do Without You"',
    source: 'Taste Engine',
  },
  {
    id: 'trk-bonobo-cirrus',
    title: 'Cirrus',
    artist: 'Bonobo',
    album: 'The North Borders',
    tags: ['downtempo', 'nu-jazz', 'microhouse', 'hypnotic'],
    category: 'Downtempo & Jazz',
    durationSec: 352,
    bpm: 118,
    energy: 71,
    year: 2013,
    youtubeId: 'WF34N4gJAKE',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Bonobo+-+Cirrus',
    ytDlpQuery: 'ytsearch1:"Bonobo - Cirrus"',
    source: 'Taste Engine',
  },
  {
    id: 'trk-maribou-monarchs',
    title: 'Monarchs',
    artist: 'Maribou State',
    album: 'Portraits',
    tags: ['downtempo', 'organic-house', 'uk-electronic', 'warm-analog'],
    category: 'Downtempo & Jazz',
    durationSec: 261,
    bpm: 116,
    energy: 64,
    year: 2015,
    youtubeId: 'maribou01',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Maribou+State+-+Monarchs',
    ytDlpQuery: 'ytsearch1:"Maribou State - Monarchs"',
    source: 'iTunes Catalog',
  },
  {
    id: 'trk-aphex-xtal',
    title: 'Xtal',
    artist: 'Aphex Twin',
    album: 'Selected Ambient Works 85-92',
    tags: ['idm', 'ambient-techno', 'rave-nostalgia', 'analog-synth'],
    category: 'Electronic',
    durationSec: 294,
    bpm: 126,
    energy: 67,
    year: 1992,
    youtubeId: 'Nevnq7MvVTI',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Aphex+Twin+-+Xtal',
    ytDlpQuery: 'ytsearch1:"Aphex Twin - Xtal"',
    source: 'MusicBrainz',
  },
  {
    id: 'trk-parcels-overnight',
    title: 'Overnight',
    artist: 'Parcels',
    album: 'Overnight Single',
    tags: ['filter-disco', 'groovy', 'psychedelic-funk', 'warm-analog'],
    category: 'Indie & Funk',
    durationSec: 219,
    bpm: 120,
    energy: 81,
    year: 2017,
    youtubeId: '2x9mfgUsIis',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Parcels+-+Overnight',
    ytDlpQuery: 'ytsearch1:"Parcels - Overnight"',
    source: 'iTunes Catalog',
  },
  {
    id: 'trk-floating-lespalais',
    title: 'LesAlpx',
    artist: 'Floating Points',
    album: 'Crush',
    tags: ['leftfield-electronic', 'modular-synth', 'uk-garage', 'melodic-electronic'],
    category: 'Electronic',
    durationSec: 282,
    bpm: 129,
    energy: 83,
    year: 2019,
    youtubeId: 'fp-lesalpx',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Floating+Points+-+LesAlpx',
    ytDlpQuery: 'ytsearch1:"Floating Points - LesAlpx"',
    source: 'Taste Engine',
  },
  {
    id: 'trk-yussef-blackfocus',
    title: 'Black Focus',
    artist: 'Yussef Kamaal',
    album: 'Black Focus',
    tags: ['nu-jazz', 'breakbeat', 'groovy', 'uk-electronic'],
    category: 'Downtempo & Jazz',
    durationSec: 274,
    bpm: 119,
    energy: 76,
    year: 2016,
    youtubeId: 'yussef-bf',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Yussef+Kamaal+-+Black+Focus',
    ytDlpQuery: 'ytsearch1:"Yussef Kamaal - Black Focus"',
    source: 'MusicBrainz',
  },
  {
    id: 'trk-RossFromFriends-talktome',
    title: "Talk to Me You'll Understand",
    artist: 'Ross from Friends',
    album: 'Outsiders',
    tags: ['lo-fi-house', 'breakbeat', 'rave-nostalgia', 'analog-synth'],
    category: 'Electronic',
    durationSec: 398,
    bpm: 127,
    energy: 77,
    year: 2016,
    youtubeId: 'ross-talk',
    youtubeUrl: 'https://www.youtube.com/results?search_query=Ross+from+Friends+-+Talk+to+Me+Youll+Understand',
    ytDlpQuery: 'ytsearch1:"Ross from Friends - Talk to Me You\'ll Understand"',
    source: 'Taste Engine',
  }
];
