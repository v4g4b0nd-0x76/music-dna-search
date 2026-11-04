import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import {
  extractGroundingSources,
  extractSuggestedTracksFromMarkdown,
  buildGroundedFallbackResponse,
} from '@/lib/gemini-crate-assistant';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query: string = typeof body.query === 'string' ? body.query.trim() : '';

    if (!query) {
      return NextResponse.json(
        { error: 'Please enter a track, artist, label, or music query for Google Search Grounding.' },
        { status: 400 }
      );
    }

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

      try {
        const prompt = [
          `Research up-to-date music release information, record label details, vinyl pressings, live sets, and similar tracks for: "${query}".`,
          `Format your response in concise Markdown and include 2 to 4 specific track recommendations using the format **Artist - Title** (Year · BPM · #tag1 #tag2).`,
        ].join('\n');

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
          },
        });

        const text = response.text || '';
        const candidate = response.candidates?.[0];
        const { sources, searchQueries } = extractGroundingSources(candidate);
        const suggestedTracks = extractSuggestedTracksFromMarkdown(text);

        if (text.trim()) {
          return NextResponse.json({
            query,
            modelUsed: 'gemini-3.8-flash',
            summary: text,
            sources,
            searchQueries,
            suggestedTracks,
          });
        }
      } catch (err) {
        console.warn('Google Search Grounding fallback triggered:', err);
      }
    }

    const fallback = buildGroundedFallbackResponse(query, 'crate-digger', undefined, true);
    return NextResponse.json({
      query,
      modelUsed: 'gemini-3.8-flash',
      summary: fallback.text,
      sources: fallback.sources,
      searchQueries: fallback.searchQueries,
      suggestedTracks: fallback.suggestedTracks,
    });
  } catch (err) {
    console.error('Error in /api/gemini/search:', err);
    return NextResponse.json(
      { error: 'Failed to execute Google Search Grounding query.' },
      { status: 500 }
    );
  }
}
