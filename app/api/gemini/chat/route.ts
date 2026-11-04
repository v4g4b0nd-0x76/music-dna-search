import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import {
  GeminiCrateRole,
  GeminiTaskTier,
  TasteContextSummary,
  resolveGeminiModelForTier,
  buildCrateAssistantSystemInstruction,
  extractGroundingSources,
  normalizeChatHistoryForSdk,
  extractSuggestedTracksFromMarkdown,
  buildGroundedFallbackResponse,
} from '@/lib/gemini-crate-assistant';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message: string = typeof body.message === 'string' ? body.message.trim() : '';
    const role: GeminiCrateRole = body.role || 'crate-digger';
    const tier: GeminiTaskTier = body.tier || 'general';
    const enableSearchGrounding: boolean = Boolean(body.enableSearchGrounding);
    const history: Array<{ role: 'user' | 'model'; text: string }> = Array.isArray(body.history)
      ? body.history
      : [];
    const tasteContext: TasteContextSummary | undefined = body.tasteContext;

    if (!message) {
      return NextResponse.json(
        { error: 'Please provide a message for the Gemini Crate Assistant.' },
        { status: 400 }
      );
    }

    const systemInstruction = buildCrateAssistantSystemInstruction(role, tasteContext);
    const targetModel = resolveGeminiModelForTier(tier, enableSearchGrounding);

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const hasValidKey = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');

    if (hasValidKey) {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const normalizedHistory = normalizeChatHistoryForSdk(history);
      const contents = [
        ...normalizedHistory,
        {
          role: 'user' as const,
          parts: [{ text: message }],
        },
      ];

      const callModel = async (modelId: string, withSearch: boolean) => {
        return ai.models.generateContent({
          model: modelId,
          contents,
          config: {
            systemInstruction,
            ...(withSearch ? { tools: [{ googleSearch: {} }] } : {}),
          },
        });
      };

      try {
        const response = await callModel(targetModel, enableSearchGrounding);
        const text = response.text || '';
        const candidate = response.candidates?.[0];
        const { sources, searchQueries } = extractGroundingSources(candidate);
        const suggestedTracks = extractSuggestedTracksFromMarkdown(text);

        if (text.trim()) {
          return NextResponse.json({
            text,
            modelUsed: targetModel,
            grounded: enableSearchGrounding,
            sources,
            searchQueries,
            suggestedTracks,
          });
        }
      } catch (primaryErr) {
        // If gemini-4-argon fails because the user declined paid API key setup, fallback to gemini-3.8-flash
        if (targetModel === 'gemini-4-argon') {
          try {
            const fallbackResponse = await callModel('gemini-3.8-flash', enableSearchGrounding);
            const text = fallbackResponse.text || '';
            const candidate = fallbackResponse.candidates?.[0];
            const { sources, searchQueries } = extractGroundingSources(candidate);
            const suggestedTracks = extractSuggestedTracksFromMarkdown(text);

            if (text.trim()) {
              return NextResponse.json({
                text,
                modelUsed: 'gemini-3.8-flash',
                grounded: enableSearchGrounding,
                sources,
                searchQueries,
                suggestedTracks,
              });
            }
          } catch {
            // Fall through to deterministic grounded fallback below
          }
        }
        console.warn('Gemini chat API fallback triggered:', primaryErr);
      }
    }

    // Resilient fallback when running without an active GEMINI_API_KEY in local/preview environments
    const fallback = buildGroundedFallbackResponse(
      message,
      role,
      tasteContext,
      enableSearchGrounding
    );

    return NextResponse.json({
      text: fallback.text,
      modelUsed: targetModel,
      grounded: enableSearchGrounding,
      sources: fallback.sources,
      searchQueries: fallback.searchQueries,
      suggestedTracks: fallback.suggestedTracks,
    });
  } catch (err) {
    console.error('Error in /api/gemini/chat:', err);
    return NextResponse.json(
      { error: 'Failed to process Gemini chat request.' },
      { status: 500 }
    );
  }
}
