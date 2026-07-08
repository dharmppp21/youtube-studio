import { useState } from 'react';
import {
  Swords, Crown, Plus, X, Loader2, Copy, Check, Sparkles, Trophy, RotateCcw
} from 'lucide-react';
import { authedFetch } from '../firebase';

interface TitleScore {
  title: string;
  score: number;
  verdict: string;
  reasoning: string;
  improved: string;
}

const MIN_TITLES = 2;
const MAX_TITLES = 5;

/** Best-effort human-readable error from a non-2xx /api response. */
async function readServerError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body?.error?.message) return body.error.message;
  } catch {
    /* not JSON */
  }
  return `${fallback} (HTTP ${res.status})`;
}

/** Score-driven bar color: green (hot) -> amber -> red (cold). */
function scoreColor(score: number): string {
  if (score >= 75) return '#10b981';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

export default function TitleShowdownView() {
  const [titles, setTitles] = useState<string[]>(['', '']);
  const [context, setContext] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TitleScore[] | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const updateTitle = (index: number, value: string) => {
    setTitles(prev => prev.map((t, i) => (i === index ? value : t)));
  };

  const addTitle = () => {
    setTitles(prev => (prev.length >= MAX_TITLES ? prev : [...prev, '']));
  };

  const removeTitle = (index: number) => {
    setTitles(prev => (prev.length <= MIN_TITLES ? prev : prev.filter((_, i) => i !== index)));
  };

  const reset = () => {
    setResults(null);
    setError(null);
  };

  const filledTitles = titles.map(t => t.trim()).filter(Boolean);
  const canBattle = filledTitles.length >= MIN_TITLES && !isLoading;

  const runShowdown = async () => {
    if (filledTitles.length < MIN_TITLES) return;
    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await authedFetch('/api/rank-titles', {
        method: 'POST',
        body: JSON.stringify({ titles: filledTitles, context: context.trim() || undefined })
      });

      if (!res.ok) {
        throw new Error(await readServerError(res, 'Failed to run the CTR Showdown.'));
      }

      const data = await res.json();
      const raw: TitleScore[] = Array.isArray(data.results) ? data.results : [];
      // Sort winner-first; guard against a model that returns unsorted or noisy scores.
      const sorted = [...raw].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
      setResults(sorted);
    } catch (err: any) {
      setError(err.message || 'Something went wrong running the showdown.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyTitle = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const topScore = results && results.length > 0 ? (Number(results[0].score) || 0) : 0;

  return (
    <div className="space-y-6 animate-fade-in" id="ctr-lab-container">
      {/* Hero header */}
      <div className="bg-gradient-to-r from-red-950/40 via-[#1e1e1e] to-[#1e1e1e] border border-[#333] rounded-md p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-sm bg-red-600/15 border border-red-500/25 text-red-500 flex-shrink-0">
            <Swords className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-sans text-white tracking-tight flex items-center gap-2">
              CTR Lab — Title Showdown
            </h1>
            <p className="text-xs text-gray-400 font-sans mt-0.5 max-w-xl leading-relaxed">
              Pit your candidate titles against each other. Gemini scores each on predicted click-through,
              explains why, and hands you a sharper rewrite. May the best hook win.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Contenders form (left) */}
        <div className="lg:col-span-5 bg-[#1e1e1e] border border-[#333] rounded-md p-6 space-y-4">
          <h3 className="text-sm font-bold font-sans text-white uppercase tracking-wider flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" /> The Contenders
          </h3>

          <div className="space-y-2">
            {titles.map((title, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-[10px] font-bold font-mono bg-[#0f0f0f] border border-[#333] text-gray-400 rounded-sm">
                  {index + 1}
                </span>
                <input
                  type="text"
                  placeholder={`Candidate title #${index + 1}`}
                  value={title}
                  onChange={(e) => updateTitle(index, e.target.value)}
                  maxLength={200}
                  className="flex-1 bg-[#0f0f0f] border border-[#333] rounded-sm px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans"
                />
                <button
                  type="button"
                  onClick={() => removeTitle(index)}
                  disabled={titles.length <= MIN_TITLES}
                  className="p-2 rounded-sm text-gray-500 hover:text-red-400 hover:bg-red-950/40 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  title="Remove title"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addTitle}
            disabled={titles.length >= MAX_TITLES}
            className="w-full py-2 border border-dashed border-[#444] text-gray-400 hover:text-white hover:border-[#3ea6ff]/50 rounded-sm text-[11px] font-bold font-sans uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            {titles.length >= MAX_TITLES ? 'Max 5 contenders' : 'Add another title'}
          </button>

          <div className="space-y-1 pt-2 border-t border-[#333]">
            <label className="text-[10px] font-bold font-sans text-[#aaa] uppercase tracking-wider">Video Context (Optional)</label>
            <input
              type="text"
              placeholder="e.g. a 12-min Elden Ring boss guide for beginners"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans"
            />
          </div>

          <button
            type="button"
            onClick={runShowdown}
            disabled={!canBattle}
            className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-gray-500 text-white text-xs font-bold font-sans rounded-sm tracking-wider uppercase transition-all shadow flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Scoring the ring...
              </>
            ) : (
              <>
                <Swords className="w-4 h-4" /> Start the Showdown
              </>
            )}
          </button>

          {error && (
            <div className="p-3 bg-red-950/20 border border-red-900/30 text-red-400 text-[11px] rounded-sm font-sans font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Results arena (right) */}
        <div className="lg:col-span-7 space-y-3">
          {results && results.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold font-sans text-white uppercase tracking-wider">Leaderboard</h3>
                <button
                  onClick={reset}
                  className="text-[10px] font-sans text-[#3ea6ff] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Clear
                </button>
              </div>

              {results.map((r, idx) => {
                const score = Number(r.score) || 0;
                const isWinner = idx === 0 && topScore > 0;
                return (
                  <div
                    key={idx}
                    className={`bg-[#1e1e1e] border rounded-md p-5 space-y-3 transition-all ${
                      isWinner ? 'border-amber-500/50 ring-1 ring-amber-500/20 shadow-lg shadow-amber-500/5' : 'border-[#333] hover:border-[#444]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-sm font-bold font-mono text-sm ${
                          isWinner ? 'bg-amber-500 text-black' : 'bg-[#0f0f0f] border border-[#333] text-gray-400'
                        }`}>
                          {isWinner ? <Crown className="w-4 h-4" /> : idx + 1}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold font-sans text-white leading-snug break-words">{r.title}</h4>
                          <span className={`inline-block mt-1 text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${
                            isWinner
                              ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                              : 'bg-[#282828] border-[#333] text-gray-400'
                          }`}>
                            {r.verdict}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-2xl font-light tracking-tight" style={{ color: scoreColor(score) }}>{score}</span>
                        <span className="block text-[9px] font-mono uppercase tracking-wider text-gray-500">CTR score</span>
                      </div>
                    </div>

                    {/* Score bar */}
                    <div className="h-1.5 w-full bg-[#0f0f0f] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${Math.max(2, Math.min(100, score))}%`, backgroundColor: scoreColor(score) }}
                      />
                    </div>

                    <p className="text-[11px] text-gray-400 font-sans leading-relaxed">{r.reasoning}</p>

                    {r.improved && (
                      <div className="flex items-center justify-between gap-3 bg-[#0f0f0f] border border-[#333] rounded-sm p-2.5">
                        <div className="min-w-0">
                          <span className="text-[9px] uppercase font-mono tracking-wider text-[#3ea6ff] block font-bold flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> Sharper rewrite
                          </span>
                          <p className="text-[11px] text-gray-200 font-sans mt-0.5 break-words">{r.improved}</p>
                        </div>
                        <button
                          onClick={() => copyTitle(r.improved, idx)}
                          className="p-2 flex-shrink-0 text-gray-400 hover:text-white transition-colors cursor-pointer"
                          title="Copy rewrite"
                        >
                          {copiedIdx === idx ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <div className="bg-[#1e1e1e] border border-[#333] rounded-md p-12 text-center flex flex-col items-center justify-center h-full min-h-[300px]">
              {isLoading ? (
                <>
                  <Loader2 className="w-8 h-8 text-red-500 animate-spin mb-3" />
                  <p className="text-xs text-gray-400 font-sans animate-pulse">Gemini is ringside, scoring your hooks...</p>
                </>
              ) : (
                <>
                  <Swords className="w-8 h-8 text-gray-500 mb-2" />
                  <h4 className="text-xs font-bold font-sans text-white">The ring is empty</h4>
                  <p className="text-[11px] text-gray-400 font-sans mt-1 max-w-sm">
                    Add at least two candidate titles on the left and start the showdown. We'll rank them by
                    predicted click-through and crown a winner.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
