import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TasteTrainingSample,
  fitTasteRegressionModel,
  predictTrackAffinityWithRegression,
  compileRegressionPrompt,
  PROMPT_ENGINEERING_PRESETS,
} from './taste-regression';

const SAMPLE_DATASET: TasteTrainingSample[] = [
  {
    id: 'smp-1',
    artist: 'Bicep',
    title: 'Glue',
    youtubeUrl: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
    tags: ['breakbeat', 'uk-bass'],
    category: 'Electronic',
    bpm: 130,
    energy: 82,
    rating: 9.5,
  },
  {
    id: 'smp-2',
    artist: 'Overmono',
    title: 'Good Lies',
    youtubeUrl: 'https://www.youtube.com/watch?v=overmono1',
    tags: ['breakbeat', 'rave'],
    category: 'Electronic',
    bpm: 132,
    energy: 85,
    rating: 9.0,
  },
  {
    id: 'smp-3',
    artist: 'Generic Pop Act',
    title: 'Radio Filler',
    youtubeUrl: 'https://www.youtube.com/watch?v=popfiller1',
    tags: ['commercial-pop'],
    category: 'Pop',
    bpm: 100,
    energy: 45,
    rating: 2.0,
  },
];

test('fitTasteRegressionModel computes positive drivers, negative repellers, and fit metrics (R2, MAE)', () => {
  const model = fitTasteRegressionModel(SAMPLE_DATASET);

  assert.equal(model.sampleCount, 3);
  assert.ok(model.rSquared > 0.5);
  assert.ok(model.mae < 2.5);
  assert.ok(model.optimalBpm >= 120 && model.optimalBpm <= 135);

  // #breakbeat should be a top positive driver
  const breakbeatCoeff = model.positiveDrivers.find((c) => c.feature === '#breakbeat');
  assert.ok(breakbeatCoeff);
  assert.ok(breakbeatCoeff.weight > 0);

  // #commercial-pop should be a negative repeller
  const popCoeff = model.negativeRepellers.find((c) => c.feature === '#commercial-pop');
  assert.ok(popCoeff);
  assert.ok(popCoeff.weight < 0);
});

test('predictTrackAffinityWithRegression scores positive-feature tracks higher than negative-feature tracks', () => {
  const model = fitTasteRegressionModel(SAMPLE_DATASET);

  const highMatch = predictTrackAffinityWithRegression(
    {
      artist: 'Bicep',
      tags: ['breakbeat', 'uk-bass'],
      category: 'Electronic',
      bpm: 130,
      energy: 80,
    },
    model
  );

  const lowMatch = predictTrackAffinityWithRegression(
    {
      artist: 'Generic Pop Act',
      tags: ['commercial-pop'],
      category: 'Pop',
      bpm: 100,
      energy: 45,
    },
    model
  );

  assert.ok(highMatch.predictedRating > lowMatch.predictedRating);
  assert.ok(highMatch.matchPercent > lowMatch.matchPercent);
});

test('compileRegressionPrompt injects training samples, regression weights, and user tags into prompt template', () => {
  const model = fitTasteRegressionModel(SAMPLE_DATASET);
  const preset = PROMPT_ENGINEERING_PRESETS[0];

  const prompt = compileRegressionPrompt({
    template: preset.userPromptTemplate,
    samples: SAMPLE_DATASET,
    model,
    userTags: ['breakbeat', 'uk-bass'],
    extraNotes: 'Only recommend underground vinyl releases on YouTube.',
  });

  assert.ok(prompt.includes('Bicep - Glue'));
  assert.ok(prompt.includes('Target Rating y = 9.5/10'));
  assert.ok(prompt.includes('#breakbeat'));
  assert.ok(prompt.includes('#commercial-pop'));
  assert.ok(prompt.includes('Only recommend underground vinyl releases on YouTube.'));
});
