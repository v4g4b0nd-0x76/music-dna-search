import { MusicTrack } from './music-data';

export interface TasteTrainingSample {
  id: string;
  title: string;
  artist: string;
  youtubeUrl: string;
  tags: string[];
  category: string;
  bpm: number;
  energy: number;
  /** User-assigned target affinity rating y in [0, 10] */
  rating: number;
  notes?: string;
}

export interface RegressionHyperparameters {
  /** L2 Ridge regularization strength lambda (0.01 - 2.0) */
  regularizationLambda: number;
  /** Exploration temperature tau (0.1 - 1.5) for prompt diversity */
  explorationTemperature: number;
  /** Negative sample repulsion multiplier alpha (0.5 - 3.0) */
  negativePenaltyWeight: number;
}

export interface FeatureCoefficient {
  feature: string;
  type: 'artist' | 'tag' | 'category' | 'numeric';
  weight: number;
  sampleCount: number;
}

export interface SamplePredictionResult {
  sampleId: string;
  title: string;
  artist: string;
  actualRating: number;
  predictedRating: number;
  residual: number;
}

export interface TasteRegressionModel {
  intercept: number;
  bpmWeight: number;
  energyWeight: number;
  optimalBpm: number;
  optimalEnergy: number;
  coefficients: FeatureCoefficient[];
  positiveDrivers: FeatureCoefficient[];
  negativeRepellers: FeatureCoefficient[];
  rSquared: number;
  mae: number;
  rmse: number;
  sampleCount: number;
  predictions: SamplePredictionResult[];
}

export type PromptTemplatePresetId =
  | 'ols-youtube-discovery'
  | 'contrastive-boundary'
  | 'sonic-trajectory-ytdlp'
  | 'custom-template';

export interface PromptTemplatePreset {
  id: PromptTemplatePresetId;
  name: string;
  badge: string;
  description: string;
  systemInstruction: string;
  userPromptTemplate: string;
}

export const DEFAULT_HYPERPARAMETERS: RegressionHyperparameters = {
  regularizationLambda: 0.25,
  explorationTemperature: 0.7,
  negativePenaltyWeight: 1.5,
};

export const PROMPT_ENGINEERING_PRESETS: PromptTemplatePreset[] = [
  {
    id: 'ols-youtube-discovery',
    name: '1. OLS Taste Regression -> YouTube Discovery',
    badge: 'FEW-SHOT REGRESSION',
    description:
      'Feeds your rated training samples (X -> y) and fitted ridge regression weights (β) into Gemini to search YouTube for tracks that maximize predicted affinity ŷ.',
    systemInstruction:
      'You are a Music Taste Regression Engine and YouTube Crate Digger. Use the user\'s fitted linear regression weights (β) and rated training samples (y in 0..10) to predict and verify real songs on YouTube that maximize predicted score ŷ = β₀ + Σ βᵢ xᵢ.',
    userPromptTemplate: `### TASTE REGRESSION MODEL & FEW-SHOT SAMPLES
Intercept (β₀): {{INTERCEPT}} | Fit R²: {{R_SQUARED}} | MAE: {{MAE}}
Target Sonic Center: ~{{TARGET_BPM}} BPM, Energy ~{{TARGET_ENERGY}}/100
Regularization (λ): {{LAMBDA}} | Exploration (τ): {{TEMPERATURE}}

#### Training Samples (Input X -> Target Rating y/10):
{{TRAINING_SAMPLES}}

#### Fitted Feature Weights (β Coefficients):
- Positive Drivers (Increase ŷ): {{POSITIVE_WEIGHTS}}
- Negative Repellers (Decrease ŷ): {{NEGATIVE_WEIGHTS}}
- User-Added Tags: {{USER_TAGS}}

### TASK
1. Use Google Search / YouTube grounding to find **5 real songs available on YouTube** that maximize the predicted regression score ŷ (aim for ŷ >= 8.5/10).
2. For each song, show:
   - **Artist - Title** (with estimated BPM, release year, and why it satisfies the positive β weights)
   - **Predicted Score ŷ / 10** based on the regression equation
   - **YouTube Search / Watch Link** and a working \`yt-dlp\` download command.`,
  },
  {
    id: 'contrastive-boundary',
    name: '2. Contrastive Decision Boundary (Positive vs. Negative)',
    badge: 'HYPERPLANE BOUNDARY',
    description:
      'Separates high-rated samples (y >= 7) from low-rated/disliked samples (y <= 4) to define a strict decision boundary on YouTube.',
    systemInstruction:
      'You are a Contrastive Audio Classifier and YouTube Music Researcher. Maximize distance from the user\'s negative samples while locking onto the sonic traits of their highest-rated samples.',
    userPromptTemplate: `### CONTRASTIVE TASTE HYPERPLANE
We trained a regularized taste regression model (R² = {{R_SQUARED}}, Negative Penalty α = {{NEG_PENALTY}}) on the following user samples:

{{TRAINING_SAMPLES}}

#### Decision Boundary Parameters:
- **Positive Vector (Must Match)**: {{POSITIVE_WEIGHTS}}
- **Negative Vector (Strictly Avoid)**: {{NEGATIVE_WEIGHTS}}
- **User Tags**: {{USER_TAGS}}

### TASK
Search YouTube for **5 tracks** that sit deep on the positive side of this decision boundary (~{{TARGET_BPM}} BPM) and have zero overlap with the negative vector. Include exact track titles, artists, predicted rating ŷ/10, and YouTube links.`,
  },
  {
    id: 'sonic-trajectory-ytdlp',
    name: '3. Feature-Weighted YouTube Playlist & yt-dlp Batch Builder',
    badge: 'YT-DLP + REGRESSION',
    description:
      'Uses your sample ratings and custom tags to engineer a 5-track YouTube playlist sequence plus a clean yt-dlp bash script.',
    systemInstruction:
      'You are a YouTube Music Regression Sequencer and yt-dlp CLI Engineer. Recommend real tracks matching the user\'s regression weights and output a working yt-dlp extraction script.',
    userPromptTemplate: `### REGRESSION-GUIDED YOUTUBE PLAYLIST GENERATOR
Fitted Model Center: {{TARGET_BPM}} BPM | Energy {{TARGET_ENERGY}}/100
User-Defined Tags: {{USER_TAGS}}
Top Regression Coefficients (β): {{POSITIVE_WEIGHTS}}

#### Reference Training Samples:
{{TRAINING_SAMPLES}}

### TASK
1. Find **5 YouTube music tracks** matching these exact feature weights and sequence them smoothly around {{TARGET_BPM}} BPM.
2. Provide a clean, copy-pasteable \`yt-dlp\` bash script using \`--ignore-config --no-warnings -x --audio-format mp3\` to download all 5 tracks from YouTube.`,
  },
  {
    id: 'custom-template',
    name: '4. Custom Prompt Engineering Sandbox',
    badge: 'CUSTOM TEMPLATE',
    description:
      'Write your own prompt engineering template using live placeholders like {{TRAINING_SAMPLES}}, {{POSITIVE_WEIGHTS}}, {{TARGET_BPM}}, and {{USER_TAGS}}.',
    systemInstruction:
      'You are an expert Music Taste Regression & YouTube Discovery AI. Follow the user\'s engineered prompt and ground recommendations in real YouTube tracks.',
    userPromptTemplate: `Analyze my rated music training samples and regression weights:
{{TRAINING_SAMPLES}}

Learned Positive Weights (β+): {{POSITIVE_WEIGHTS}}
Learned Negative Weights (β-): {{NEGATIVE_WEIGHTS}}
User Tags: {{USER_TAGS}} | Target BPM: {{TARGET_BPM}}

Find 4 songs on YouTube that fit my regression profile and explain their predicted score ŷ/10.`,
  },
];

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Fits a Ridge-Regularized Taste Regression Model over the user's rated training samples.
 * Pure, deterministic mathematical solver that requires zero default tags—only uses features
 * present in the user's samples and user-added tags.
 */
export function fitTasteRegressionModel(
  samples: TasteTrainingSample[],
  hyperparams: RegressionHyperparameters = DEFAULT_HYPERPARAMETERS
): TasteRegressionModel {
  if (samples.length === 0) {
    return {
      intercept: 5.0,
      bpmWeight: 0,
      energyWeight: 0,
      optimalBpm: 120,
      optimalEnergy: 70,
      coefficients: [],
      positiveDrivers: [],
      negativeRepellers: [],
      rSquared: 0,
      mae: 0,
      rmse: 0,
      sampleCount: 0,
      predictions: [],
    };
  }

  const lambda = clamp(hyperparams.regularizationLambda || 0.25, 0.01, 5.0);
  const negPenalty = clamp(hyperparams.negativePenaltyWeight || 1.5, 0.5, 4.0);

  // 1. Compute baseline intercept (mean rating ȳ)
  const ratings = samples.map((s) => clamp(s.rating, 0, 10));
  const meanRating = ratings.reduce((a, b) => a + b, 0) / samples.length;

  // 2. Compute rating-weighted optimal BPM and Energy centers
  let weightSum = 0;
  let weightedBpm = 0;
  let weightedEnergy = 0;
  for (const s of samples) {
    const w = Math.max(0.2, clamp(s.rating, 0, 10));
    weightSum += w;
    weightedBpm += (s.bpm || 120) * w;
    weightedEnergy += (s.energy || 70) * w;
  }
  const optimalBpm = Math.round(weightedBpm / (weightSum || 1));
  const optimalEnergy = Math.round(weightedEnergy / (weightSum || 1));

  // 3. Estimate continuous numeric slopes (BPM & Energy) via regularized covariance
  const meanBpm = samples.reduce((a, s) => a + (s.bpm || 120), 0) / samples.length;
  const meanEnergy = samples.reduce((a, s) => a + (s.energy || 70), 0) / samples.length;

  let covBpm = 0;
  let varBpm = 0;
  let covEnergy = 0;
  let varEnergy = 0;

  for (const s of samples) {
    const dy = clamp(s.rating, 0, 10) - meanRating;
    const db = ((s.bpm || 120) - meanBpm) / 20; // normalized per 20 BPM
    const de = ((s.energy || 70) - meanEnergy) / 20; // normalized per 20 energy units
    covBpm += db * dy;
    varBpm += db * db;
    covEnergy += de * dy;
    varEnergy += de * de;
  }

  const bpmWeight = Number((covBpm / (varBpm + lambda * 2)).toFixed(3));
  const energyWeight = Number((covEnergy / (varEnergy + lambda * 2)).toFixed(3));

  // 4. Compute categorical/tag/artist Ridge-regularized coefficients β_f
  // For each feature f: β_f = (Σ_{i ∈ f} residuals_i * penalty_i) / (count_f + λ)
  const featureStats = new Map<
    string,
    {
      feature: string;
      type: 'artist' | 'tag' | 'category';
      residualSum: number;
      count: number;
    }
  >();

  const recordFeature = (
    key: string,
    label: string,
    type: 'artist' | 'tag' | 'category',
    residual: number
  ) => {
    if (!label || label === 'Uncategorized') return;
    const effectiveResidual = residual < 0 ? residual * negPenalty : residual;
    const existing = featureStats.get(key);
    if (existing) {
      existing.residualSum += effectiveResidual;
      existing.count += 1;
    } else {
      featureStats.set(key, {
        feature: label,
        type,
        residualSum: effectiveResidual,
        count: 1,
      });
    }
  };

  for (const s of samples) {
    const y = clamp(s.rating, 0, 10);
    const residual = y - meanRating;

    if (s.artist && s.artist.trim()) {
      recordFeature(`artist:${s.artist.toLowerCase()}`, s.artist.trim(), 'artist', residual);
    }
    if (s.category && s.category.trim() && s.category !== 'Uncategorized') {
      recordFeature(`cat:${s.category.toLowerCase()}`, s.category.trim(), 'category', residual);
    }
    for (const rawTag of s.tags) {
      const cleanTag = rawTag.trim().replace(/^#+/, '').toLowerCase();
      if (cleanTag) {
        recordFeature(`tag:${cleanTag}`, `#${cleanTag}`, 'tag', residual);
      }
    }
  }

  const coefficients: FeatureCoefficient[] = Array.from(featureStats.values())
    .map((stat) => ({
      feature: stat.feature,
      type: stat.type,
      weight: Number((stat.residualSum / (stat.count + lambda)).toFixed(2)),
      sampleCount: stat.count,
    }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  const coeffLookup = new Map<string, number>();
  for (const c of coefficients) {
    coeffLookup.set(`${c.type}:${c.feature.toLowerCase()}`, c.weight);
  }

  // 5. Predict ŷ on each training sample and compute R², MAE, RMSE
  const predictions: SamplePredictionResult[] = samples.map((s) => {
    const actual = clamp(s.rating, 0, 10);
    let pred = meanRating;

    const artistW = coeffLookup.get(`artist:${s.artist.trim().toLowerCase()}`) || 0;
    const catW = coeffLookup.get(`category:${s.category.trim().toLowerCase()}`) || 0;

    let tagSum = 0;
    let tagCount = 0;
    for (const t of s.tags) {
      const clean = t.trim().replace(/^#+/, '').toLowerCase();
      const tw = coeffLookup.get(`tag:#${clean}`) || 0;
      tagSum += tw;
      tagCount += 1;
    }
    const avgTagW = tagCount > 0 ? tagSum / Math.sqrt(tagCount) : 0;

    const db = ((s.bpm || 120) - meanBpm) / 20;
    const de = ((s.energy || 70) - meanEnergy) / 20;

    pred += artistW * 0.55 + avgTagW * 0.55 + catW * 0.25 + bpmWeight * db * 0.35 + energyWeight * de * 0.35;
    const clampedPred = Number(clamp(pred, 0, 10).toFixed(2));
    const residual = Number((actual - clampedPred).toFixed(2));

    return {
      sampleId: s.id,
      title: s.title,
      artist: s.artist,
      actualRating: actual,
      predictedRating: clampedPred,
      residual,
    };
  });

  let ssRes = 0;
  let ssTot = 0;
  let absErrSum = 0;

  for (const p of predictions) {
    const err = p.actualRating - p.predictedRating;
    ssRes += err * err;
    absErrSum += Math.abs(err);
    const diffMean = p.actualRating - meanRating;
    ssTot += diffMean * diffMean;
  }

  const mae = Number((absErrSum / samples.length).toFixed(2));
  const rmse = Number(Math.sqrt(ssRes / samples.length).toFixed(2));
  const rSquared =
    ssTot > 1e-6
      ? Number(clamp(1 - ssRes / ssTot, 0, 1).toFixed(3))
      : samples.length >= 1
      ? 1.0
      : 0;

  const positiveDrivers = coefficients
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const negativeRepellers = coefficients
    .filter((c) => c.weight < 0)
    .sort((a, b) => a.weight - b.weight);

  return {
    intercept: Number(meanRating.toFixed(2)),
    bpmWeight,
    energyWeight,
    optimalBpm,
    optimalEnergy,
    coefficients,
    positiveDrivers,
    negativeRepellers,
    rSquared,
    mae,
    rmse,
    sampleCount: samples.length,
    predictions,
  };
}

/**
 * Predicts the affinity score ŷ (0.0 to 10.0) of any candidate track using a fitted TasteRegressionModel.
 */
export function predictTrackAffinityWithRegression(
  track: Pick<MusicTrack, 'artist' | 'tags' | 'category' | 'bpm' | 'energy'>,
  model: TasteRegressionModel
): { predictedRating: number; matchPercent: number; matchedFeatures: string[] } {
  if (model.sampleCount === 0) {
    return { predictedRating: 5.0, matchPercent: 50, matchedFeatures: [] };
  }

  let score = model.intercept;
  const matchedFeatures: string[] = [];

  for (const coeff of model.coefficients) {
    if (
      coeff.type === 'artist' &&
      coeff.feature.toLowerCase() === track.artist.trim().toLowerCase()
    ) {
      score += coeff.weight * 0.6;
      matchedFeatures.push(`${coeff.feature} (${coeff.weight >= 0 ? '+' : ''}${coeff.weight})`);
    } else if (
      coeff.type === 'category' &&
      coeff.feature.toLowerCase() === track.category.trim().toLowerCase()
    ) {
      score += coeff.weight * 0.3;
    } else if (coeff.type === 'tag') {
      const cleanCoeffTag = coeff.feature.replace(/^#+/, '').toLowerCase();
      if (track.tags.some((t) => t.replace(/^#+/, '').toLowerCase() === cleanCoeffTag)) {
        score += coeff.weight * 0.5;
        matchedFeatures.push(`${coeff.feature} (${coeff.weight >= 0 ? '+' : ''}${coeff.weight})`);
      }
    }
  }

  // BPM proximity bonus/penalty relative to optimalBpm
  const bpmDiff = Math.abs((track.bpm || 120) - model.optimalBpm);
  if (bpmDiff <= 12) {
    score += 0.4;
  } else if (bpmDiff > 35) {
    score -= 0.4;
  }

  const predictedRating = Number(clamp(score, 0, 10).toFixed(2));
  const matchPercent = Math.round(clamp(predictedRating * 10, 5, 99));

  return {
    predictedRating,
    matchPercent,
    matchedFeatures: matchedFeatures.slice(0, 4),
  };
}

/**
 * Compiles a custom Gemini prompt template by injecting the user's training samples,
 * fitted regression coefficients, and user-added tags.
 */
export function compileRegressionPrompt(params: {
  template: string;
  samples: TasteTrainingSample[];
  model: TasteRegressionModel;
  hyperparams?: RegressionHyperparameters;
  userTags?: string[];
  userArtists?: string[];
  extraNotes?: string;
}): string {
  const {
    template,
    samples,
    model,
    hyperparams = DEFAULT_HYPERPARAMETERS,
    userTags = [],
    userArtists = [],
    extraNotes = '',
  } = params;

  const formattedSamples =
    samples.length > 0
      ? samples
          .map((s, idx) => {
            const tagStr =
              s.tags.length > 0 ? ` | Tags: ${s.tags.map((t) => `#${t.replace(/^#+/, '')}`).join(', ')}` : '';
            const urlStr = s.youtubeUrl ? ` | YouTube: ${s.youtubeUrl}` : '';
            const pred = model.predictions.find((p) => p.sampleId === s.id);
            const predStr = pred ? ` (Predicted ŷ=${pred.predictedRating}/10)` : '';
            return `${idx + 1}. "${s.artist} - ${s.title}" [${s.bpm} BPM]${tagStr}${urlStr} => Target Rating y = ${s.rating}/10${predStr}`;
          })
          .join('\n')
      : '(No training samples added yet — add your sample songs or YouTube links above)';

  const positiveStr =
    model.positiveDrivers.length > 0
      ? model.positiveDrivers
          .slice(0, 8)
          .map((c) => `${c.feature} (β = +${c.weight})`)
          .join(', ')
      : userArtists.length > 0 || userTags.length > 0
      ? [
          ...userArtists.map((a) => `${a} (user favorite)`),
          ...userTags.map((t) => `#${t.replace(/^#+/, '')} (user tag)`),
        ].join(', ')
      : 'None specified yet';

  const negativeStr =
    model.negativeRepellers.length > 0
      ? model.negativeRepellers
          .slice(0, 6)
          .map((c) => `${c.feature} (β = ${c.weight})`)
          .join(', ')
      : 'None (no low-rated negative samples provided)';

  const allUserTags = Array.from(
    new Set([
      ...userTags.map((t) => `#${t.replace(/^#+/, '')}`),
      ...samples.flatMap((s) => s.tags.map((t) => `#${t.replace(/^#+/, '')}`)),
    ])
  );

  const userTagsStr = allUserTags.length > 0 ? allUserTags.join(', ') : 'None added by user';

  let compiled = template
    .replace(/\{\{TRAINING_SAMPLES\}\}/g, formattedSamples)
    .replace(/\{\{POSITIVE_WEIGHTS\}\}/g, positiveStr)
    .replace(/\{\{NEGATIVE_WEIGHTS\}\}/g, negativeStr)
    .replace(/\{\{USER_TAGS\}\}/g, userTagsStr)
    .replace(/\{\{TARGET_BPM\}\}/g, String(model.optimalBpm))
    .replace(/\{\{TARGET_ENERGY\}\}/g, String(model.optimalEnergy))
    .replace(/\{\{INTERCEPT\}\}/g, String(model.intercept))
    .replace(/\{\{R_SQUARED\}\}/g, String(model.rSquared))
    .replace(/\{\{MAE\}\}/g, String(model.mae))
    .replace(/\{\{LAMBDA\}\}/g, String(hyperparams.regularizationLambda))
    .replace(/\{\{TEMPERATURE\}\}/g, String(hyperparams.explorationTemperature))
    .replace(/\{\{NEG_PENALTY\}\}/g, String(hyperparams.negativePenaltyWeight));

  if (extraNotes.trim()) {
    compiled += `\n\n### ADDITIONAL USER CONSTRAINTS\n${extraNotes.trim()}`;
  }

  return compiled;
}
