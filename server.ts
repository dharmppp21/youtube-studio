import express from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
// firebase-admin v14: cert and App come from the top-level, getAuth from /auth.
import { initializeApp, cert } from 'firebase-admin/app';
import type { App, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { DecodedIdToken } from 'firebase-admin/auth';

dotenv.config();

const app = express();
// Body-size cap: protects the /api/* endpoints from oversized payloads that
// could otherwise cost Gemini tokens or buffer-exhaust the process.
app.use(express.json({ limit: '64kb' }));

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

// --- Auth (Firebase ID-token verification on /api/* routes) ---------------
//
// AUTH_MODE values:
//   required (default) -> every /api/* request must carry a valid Bearer token.
//                          401 if missing/invalid, 503 if admin not configured.
//   optional           -> proceeds without a token; req.user is null if absent.
//                          Useful for local hacking without a service account.
//   off                -> middleware is not mounted. No token required.
//
// FIREBASE_SERVICE_ACCOUNT (JSON string) or FIREBASE_SERVICE_ACCOUNT_PATH (file)
// must be set unless AUTH_MODE=off. Inline JSON wins if both are provided.
//
// Token revocation: we pass checkRevoked=false. firebase-admin already caches
// Google's public keys for JWT verification; revocation checks would add a
// network round-trip per request. A revoked token therefore remains valid
// until its natural exp (~1h). Acceptable for this app's threat model.

type AuthMode = 'required' | 'optional' | 'off';
const AUTH_MODE: AuthMode = (() => {
  const v = (process.env.AUTH_MODE || 'required').toLowerCase();
  if (v === 'required' || v === 'optional' || v === 'off') return v;
  console.warn(`[auth] Unknown AUTH_MODE="${v}" — falling back to "required"`);
  return 'required';
})();

let adminApp: App | null = null;
function getAdmin(): App | null {
  if (adminApp) return adminApp;
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!inline && !pathEnv) return null;

  let credential: ReturnType<typeof cert>;
  try {
    if (inline) {
      // Inline JSON: backslash-n in private_key will be rehydrated by JSON.parse.
      const parsed = JSON.parse(inline) as ServiceAccount;
      credential = cert(parsed);
    } else {
      // Path-mounted secret file.
      const json = fs.readFileSync(pathEnv!, 'utf-8');
      const parsed = JSON.parse(json) as ServiceAccount;
      credential = cert(parsed);
    }
  } catch (err) {
    console.error('[auth] Failed to load Firebase service account:', err);
    return null;
  }

  adminApp = initializeApp({ credential }, 'youtube-studio-server');
  return adminApp;
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function mapAuthError(err: unknown): { status: number; code: string; message: string } {
  // firebase-admin error shape: { code: 'auth/...', message: '...' }
  const code = (err as any)?.code || '';
  if (code === 'auth/id-token-expired') {
    return { status: 401, code: 'auth_expired', message: 'ID token has expired. Please re-authenticate.' };
  }
  if (code === 'auth/id-token-revoked') {
    return { status: 401, code: 'auth_revoked', message: 'ID token has been revoked.' };
  }
  if (code === 'auth/argument-error') {
    return { status: 401, code: 'auth_malformed', message: 'Invalid ID token.' };
  }
  if (typeof code === 'string' && code.startsWith('auth/')) {
    return { status: 401, code: 'auth_invalid', message: 'Invalid ID token.' };
  }
  return { status: 401, code: 'auth_invalid', message: 'Invalid ID token.' };
}

function authMiddleware(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const a = getAdmin();
    if (!a) {
      if (AUTH_MODE === 'optional') {
        (req as any).user = null;
        return next();
      }
      // required mode but no service account -> 503
      return sendError(res, 503, 'auth_not_configured', 'Server authentication is not configured.');
    }

    const header = req.header('Authorization') || req.header('authorization');
    if (!header) {
      if (AUTH_MODE === 'optional') {
        (req as any).user = null;
        return next();
      }
      return sendError(res, 401, 'auth_missing', 'Authentication required.');
    }
    const m = /^Bearer\s+(.+)$/.exec(header);
    if (!m) {
      return sendError(res, 401, 'auth_malformed', 'Authorization header must be a Bearer token.');
    }
    const token = m[1].trim();
    if (!token) {
      return sendError(res, 401, 'auth_malformed', 'Bearer token is empty.');
    }

    try {
      const decoded: DecodedIdToken = await getAuth(a).verifyIdToken(token, false);
      (req as any).user = {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: !!decoded.email_verified
      };
      return next();
    } catch (err) {
      console.error('[auth] verifyIdToken failed:', err);
      const mapped = mapAuthError(err);
      return sendError(res, mapped.status, mapped.code, mapped.message);
    }
  };
}

// Augment Express Request to carry the verified user.
declare module 'express-serve-static-core' {
  interface Request {
    user?: { uid: string; email?: string; emailVerified: boolean } | null;
  }
}

// --- Robust Gemini JSON parsing --------------------------------------------
//
// extractFirstJson scans a free-form Gemini response and returns the first
// top-level JSON value as a parsed object. It is bracket-aware (tracks depth
// for objects and arrays) and quote-aware (does not treat braces inside
// strings as structural). It strips an optional leading/trailing ``` or
// ```json fence line — but only if the fence is the first or last *whole*
// line, so a string content containing triple backticks is not mangled.
//
// No regex-based global stripping (the previous code did `.replace(/```/g, '')`
// which would also remove triple-backticks that appeared inside string
// contents). No "lenient" fallback parse — if JSON.parse fails after a clean
// extraction, the model emitted malformed output and that should be loud,
// not silently coerced.

function extractFirstJson(text: string): unknown | null {
  if (!text) return null;
  // Strip BOM, normalise whitespace at edges.
  let s = text.replace(/^﻿/, '').replace(/^\s+/, '');
  // Drop a leading ``` or ```json fence line, if present.
  const firstLineEnd = s.indexOf('\n');
  if (firstLineEnd > 0) {
    const firstLine = s.slice(0, firstLineEnd).trim();
    if (/^```(?:json)?$/i.test(firstLine)) {
      s = s.slice(firstLineEnd + 1).replace(/^\s+/, '');
    }
  }
  // Drop a trailing ``` fence line, if present.
  if (/```\s*$/.test(s)) {
    s = s.replace(/```\s*$/, '').replace(/\s+$/, '');
  }

  // Walk char-by-char, tracking string state and brace/bracket depth.
  let inString = false;
  let escape = false;
  let depthObj = 0;
  let depthArr = 0;
  let start = -1;
  let end = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') { inString = false; }
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (start === -1) {
      if (c === '{' || c === '[') { start = i; depthObj = c === '{' ? 1 : 0; depthArr = c === '[' ? 1 : 0; }
      continue;
    }
    if (c === '{') depthObj++;
    else if (c === '}') {
      depthObj--;
      if (depthObj === 0 && depthArr === 0) { end = i; break; }
    } else if (c === '[') depthArr++;
    else if (c === ']') {
      depthArr--;
      if (depthObj === 0 && depthArr === 0) { end = i; break; }
    }
  }
  if (start === -1 || end === -1) return null;
  const candidate = s.slice(start, end + 1);
  try { return JSON.parse(candidate); } catch { return null; }
}

// stripReply: text-only endpoint helper. Strips a symmetric outer quote pair
// (if any), a leading/trailing fence line (if any), and known leading
// preamble phrases like "Here is the reply:". Does not attempt JSON parse.
function stripReply(text: string): string {
  if (!text) return '';
  let s = text.replace(/^﻿/, '').trim();
  // Drop a leading ``` or ```json fence line.
  const firstLineEnd = s.indexOf('\n');
  if (firstLineEnd > 0) {
    const firstLine = s.slice(0, firstLineEnd).trim();
    if (/^```(?:[a-z]+)?$/i.test(firstLine)) {
      s = s.slice(firstLineEnd + 1).trim();
    }
  }
  // Drop a trailing ``` fence line.
  if (/```\s*$/.test(s)) {
    s = s.replace(/```\s*$/, '').trim();
  }
  // Strip symmetric outer straight or curly quotes.
  if (s.length >= 2) {
    const a = s[0], b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      s = s.slice(1, -1).trim();
    } else if (a === '“' && b === '”') {
      s = s.slice(1, -1).trim();
    }
  }
  // Strip a small set of common preamble phrases.
  const preamble = /^(?:here(?:'s| is) (?:the |a )?reply\s*[:\-]\s*)/i;
  s = s.replace(preamble, '');
  return s.trim();
}

// --- Routes ----------------------------------------------------------------

// Mount the auth middleware on a sub-router scoped to /api. This guarantees
// no future /api/* route can be added without going through it.
const apiRouter = express.Router();
if (AUTH_MODE !== 'off') {
  apiRouter.use(authMiddleware());
}

// Helper: parse a Gemini response into JSON, returning a 502 with an excerpt
// if extraction fails. The previous code used a brittle regex on every
// triple-backtick in the response; this rejects cleanly when the model emits
// something we cannot structurally parse.
function parseAiJson(res: Response, rawText: string, fallbackCode = 'ai_parse_failed'): unknown {
  const parsed = extractFirstJson(rawText);
  if (parsed === null) {
    const excerpt = rawText.slice(0, 500);
    console.error(`[ai] Failed to parse Gemini JSON. Excerpt: ${excerpt}`);
    sendError(res, 502, fallbackCode, 'AI returned non-JSON output.');
    return undefined;
  }
  return parsed;
}

// 1. Generate Video Ideas
apiRouter.post('/generate-ideas', async (req, res) => {
  try {
    const { niche, keywords, tone } = req.body || {};
    if (!niche) {
      return sendError(res, 400, 'invalid_input', 'Niche is required.');
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
    const parsed = parseAiJson(res, text);
    if (parsed === undefined) return;
    res.json({ ideas: parsed });
  } catch (err: any) {
    console.error('Error in /api/generate-ideas:', err);
    sendError(res, 500, 'internal_error', err?.message || 'Failed to generate ideas');
  }
});

// 2. Generate SEO Tags & Optimizations
apiRouter.post('/generate-seo', async (req, res) => {
  try {
    const { title, category } = req.body || {};
    if (!title) {
      return sendError(res, 400, 'invalid_input', 'Title is required.');
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
    const parsed = parseAiJson(res, text);
    if (parsed === undefined) return;
    res.json(parsed);
  } catch (err: any) {
    console.error('Error in /api/generate-seo:', err);
    sendError(res, 500, 'internal_error', err?.message || 'Failed to generate SEO assets');
  }
});

// 3. Generate Video Script
apiRouter.post('/generate-script', async (req, res) => {
  try {
    const { title, style, type, duration } = req.body || {};
    if (!title) {
      return sendError(res, 400, 'invalid_input', 'Title is required.');
    }

    const ai = getAI();
    const isShort = type === 'short';
    const prompt = `You are a world-class YouTube scriptwriter for creators like MrBeast, Ali Abdaal, and Marques Brownlee.
Draft a comprehensive video script outline for the ${isShort ? 'YouTube Short / TikTok' : 'YouTube Video'} titled: "${title}".
Style format: "${style || 'narrative storytelling'}".
Target Duration: ${duration || '8-10 minutes'}.

Return ONLY a JSON object. Do not use markdown wrappers.
The JSON object should have:
- "estimatedDuration": e.g., "8-10 minutes"
- "hook": Script for the first 30 seconds (hook, value proposition, and re-engagement loop). Include [Visual Cues].
- "sections": An array of objects representing chapters:
  - "chapterTitle": Title of this segment.
  - "scriptOutline": Concise written dialogue/points for this section.
  - "visualAesthetics": Descriptions of b-roll, text on screen, and sound effects.
  - "bRollSuggestions": An array of highly detailed, cinematic text prompts (formatted for Luma Dream Machine, Kling AI, or Runway) so the creator can generate completely custom B-Roll clips. Each object should have:
      - "prompt": The exact detailed cinematic text prompt to copy/paste into an AI Video Generator.
      - "reason": Why this specific shot is perfect for this chapter.
- "outro": Script for the ending (call to action, end-screen card placeholder, subscriber request).`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const parsed = parseAiJson(res, text);
    if (parsed === undefined) return;
    res.json(parsed);
  } catch (err: any) {
    console.error('Error in /api/generate-script:', err);
    sendError(res, 500, 'internal_error', err?.message || 'Failed to generate video script');
  }
});

// 4. Generate AI Comment Reply
apiRouter.post('/generate-reply', async (req, res) => {
  try {
    const { commentText, videoTitle, tone } = req.body || {};
    if (!commentText) {
      return sendError(res, 400, 'invalid_input', 'Comment text is required.');
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

    const reply = stripReply(response.text || '');
    if (!reply) {
      console.error('[ai] Empty reply after stripping wrappers. Raw:', (response.text || '').slice(0, 500));
      return sendError(res, 502, 'ai_empty_reply', 'AI returned an empty reply.');
    }
    res.json({ reply });
  } catch (err: any) {
    console.error('Error in /api/generate-reply:', err);
    sendError(res, 500, 'internal_error', err?.message || 'Failed to generate comment reply');
  }
});

// 5. Generate Viral Trends
apiRouter.post('/generate-trends', async (req, res) => {
  try {
    const { niche } = req.body || {};
    
    const ai = getAI();
    const prompt = `You are a YouTube analytics engine. 
Generate 7 trending, high-momentum topics for a YouTube channel in the "${niche || 'general technology'}" niche right now.

Return ONLY a JSON array of objects. Do not use markdown wrappers.
Each object must have:
- "topic": Short string (2-3 words) describing the trend.
- "x": Number between 20 and 90 representing Competition (lower is better).
- "y": Number between 30 and 150 representing Momentum (percentage growth).
- "z": Number between 100 and 300 representing Search Volume (in thousands).
- "fill": A vibrant hex color code representing this topic (e.g. "#3ea6ff").`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const parsed = parseAiJson(res, text);
    if (parsed === undefined) return;
    res.json({ trends: parsed });
  } catch (err: any) {
    console.error('Error in /api/generate-trends:', err);
    sendError(res, 500, 'internal_error', err?.message || 'Failed to generate trends');
  }
});

// 6. Generate Shorts (Repurposer)
apiRouter.post('/generate-shorts', async (req, res) => {
  try {
    const { videoTitle, videoDescription } = req.body || {};
    if (!videoTitle) {
      return sendError(res, 400, 'invalid_input', 'Video title is required.');
    }

    const ai = getAI();
    const prompt = `You are a viral YouTube Shorts and TikTok strategist.
Take this long-form video concept and repurpose it into 3 highly engaging, 60-second short-form video scripts.

Long-form Title: "${videoTitle}"
Long-form Context: "${videoDescription || 'N/A'}"

Return ONLY a JSON array of 3 objects. Do not use markdown wrappers.
Each object must have:
- "hook": The explosive opening sentence (first 3 seconds).
- "script": The main body of the short script (fast-paced, high retention).
- "visualIdea": A brief description of what should be on screen.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const parsed = parseAiJson(res, text);
    if (parsed === undefined) return;
    res.json({ shorts: parsed });
  } catch (err: any) {
    console.error('Error in /api/generate-shorts:', err);
    sendError(res, 500, 'internal_error', err?.message || 'Failed to generate shorts');
  }
});

// Mount the /api router. Body parsing already happened via app.use(express.json()).
app.use('/api', apiRouter);

// --- Vite Middleware & Static Asset Serving Setup --------------------------
async function startServer() {
  // Print auth startup banner — surfaces misconfiguration loudly in dev/prod logs.
  const adminInitialized = getAdmin() !== null;
  console.log(`[auth] mode=${AUTH_MODE} admin=${adminInitialized ? 'initialized' : 'not-configured'}`);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`YouTube Studio Dev server running on http://localhost:${PORT}`);
  });
}

startServer();