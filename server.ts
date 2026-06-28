import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required. Please set it in your AI Studio Secrets panel.');
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

// REST API routes for Gemini AI Assistant Features

// 1. Generate Video Ideas
app.post('/api/generate-ideas', async (req, res) => {
  try {
    const { niche, keywords, tone } = req.body;
    if (!niche) {
      res.status(400).json({ error: 'Niche is required' });
      return;
    }

    const ai = getAI();
    const prompt = `You are a high-performing YouTube Growth Consultant and Video Strategist.
Generate 5 viral, highly clickable video concept ideas for a creator in the "${niche}" niche.
Focus on keywords: "${keywords || 'any trending topics'}".
The desired tone of the video is: "${tone || 'informative and engaging'}".

Return ONLY a JSON array of objects. Do not include markdown code block syntax (like \`\`\`json). Just return the raw JSON text.
Each object must have:
- "title": A high CTR, curious, or benefit-driven YouTube title (under 70 chars).
- "description": A short 2-sentence synopsis explaining the video concept and hook.
- "targetAudience": Who is this video specifically targeting?
- "difficulty": "Low", "Medium", or "High" (relative effort to produce).
- "ctrStrength": "High", "Very High", or "Extreme" based on psychological triggers.
- "angle": The strategic psychological hook (e.g. "Debunking a common myth", "Answering a burning question", "Step-by-step challenge").`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '';
    // Clean potential markdown wrapper
    const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanText);
    res.json({ ideas: parsed });
  } catch (err: any) {
    console.error('Error in /api/generate-ideas:', err);
    res.status(500).json({ error: err.message || 'Failed to generate ideas' });
  }
});

// 2. Generate SEO Tags & Optimizations
app.post('/api/generate-seo', async (req, res) => {
  try {
    const { title, category } = req.body;
    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const ai = getAI();
    const prompt = `You are an expert in YouTube Search Engine Optimization (SEO) and algorithm mechanics.
For the YouTube video title: "${title}" (Category: "${category || 'General'}"), optimize the SEO assets.

Generate:
1. Three alternative titles that might perform better (using curiosity gaps or power words).
2. A full, professional, search-optimized description containing an introduction paragraph, key timestamps placeholders, a resources/links placeholder, and some social links placeholders.
3. Fifteen high-traffic, highly relevant tags/keywords for tag fields.

Return ONLY a raw JSON object. Do not wrap in markdown or \`\`\`json tags.
JSON schema structure:
{
  "alternativeTitles": ["string", "string", "string"],
  "optimizedDescription": "string (multiline text with good formatting)",
  "suggestedTags": ["tag1", "tag2", ..., "tag15"]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanText);
    res.json(parsed);
  } catch (err: any) {
    console.error('Error in /api/generate-seo:', err);
    res.status(500).json({ error: err.message || 'Failed to generate SEO assets' });
  }
});

// 3. Generate Video Script
app.post('/api/generate-script', async (req, res) => {
  try {
    const { title, style } = req.body;
    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const ai = getAI();
    const prompt = `You are a world-class YouTube scriptwriter for creators like MrBeast, Ali Abdaal, and Marques Brownlee.
Draft a comprehensive video script outline for the video titled: "${title}".
Style format: "${style || 'narrative storytelling'}".

Return ONLY a JSON object. Do not use markdown wrappers.
The JSON object should have:
- "estimatedDuration": e.g., "8-10 minutes"
- "hook": Script for the first 30 seconds (hook, value proposition, and re-engagement loop). Include [Visual Cues].
- "sections": An array of objects representing chapters:
  - "chapterTitle": Title of this segment.
  - "scriptOutline": Concise written dialogue/points for this section.
  - "visualAesthetics": Descriptions of b-roll, text on screen, and sound effects.
- "outro": Script for the ending (call to action, end-screen card placeholder, subscriber request).`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanText);
    res.json(parsed);
  } catch (err: any) {
    console.error('Error in /api/generate-script:', err);
    res.status(500).json({ error: err.message || 'Failed to generate video script' });
  }
});

// 4. Generate AI Comment Reply
app.post('/api/generate-reply', async (req, res) => {
  try {
    const { commentText, videoTitle, tone } = req.body;
    if (!commentText) {
      res.status(400).json({ error: 'Comment text is required' });
      return;
    }

    const ai = getAI();
    const prompt = `You are a friendly, community-oriented YouTube Creator.
You want to reply to a fan's comment on your video titled: "${videoTitle || 'Your latest video'}".
The fan's comment: "${commentText}"
The reply tone should be: "${tone || 'warm and appreciative'}".

Write a short, engaging, natural-sounding, human reply. Avoid sounding generic (e.g., don't just say "Thanks for watching!"). Try to refer to their comment specifically or ask a friendly follow-up question. Keep it under 200 characters so it fits community standards.

Return ONLY the raw drafted reply string. Do not wrap in JSON or quotes or markdown. Just the text.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    res.json({ reply: (response.text || '').trim() });
  } catch (err: any) {
    console.error('Error in /api/generate-reply:', err);
    res.status(500).json({ error: err.message || 'Failed to generate comment reply' });
  }
});

// Vite Middleware & Static Asset Serving Setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`YouTube Studio Dev server running on http://localhost:${PORT}`);
  });
}

startServer();
