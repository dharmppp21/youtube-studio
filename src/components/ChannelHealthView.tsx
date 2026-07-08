import { useMemo, useState } from 'react';
import { Channel, Video, Comment, AnalyticsSnapshot } from '../types';
import { HeartPulse, Sparkles, Loader2, Zap, Target } from 'lucide-react';
import { authedFetch } from '../firebase';

interface ChannelHealthViewProps {
  channel: Channel | null;
  videos: Video[];
  comments: Comment[];
  analytics: AnalyticsSnapshot[];
}

interface Metric {
  key: string;
  label: string;
  /** 0-100, or null when there isn't enough data to judge. */
  score: number | null;
  /** Human-readable measured value, e.g. "3.2%" or "6d avg gap". */
  value: string;
  tip: string;
  weight: number;
}

interface CoachPlan {
  summary: string;
  actions: { title: string; detail: string }[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const DAY_MS = 24 * 60 * 60 * 1000;

/** Score band -> label + hex color, shared by gauge and bars. */
function band(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Excellent', color: '#10b981' };
  if (score >= 60) return { label: 'Good', color: '#3ea6ff' };
  if (score >= 40) return { label: 'Fair', color: '#f59e0b' };
  return { label: 'Needs work', color: '#ef4444' };
}

async function readServerError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body?.error?.message) return body.error.message;
  } catch {
    /* not JSON */
  }
  return `${fallback} (HTTP ${res.status})`;
}

export default function ChannelHealthView({ channel, videos, comments, analytics }: ChannelHealthViewProps) {
  const [isCoaching, setIsCoaching] = useState(false);
  const [coach, setCoach] = useState<CoachPlan | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);

  const { overall, metrics } = useMemo(() => {
    const totalViews = videos.reduce((s, v) => s + (v.views || 0), 0);
    const totalLikes = videos.reduce((s, v) => s + (v.likes || 0), 0);
    const totalComments = videos.reduce((s, v) => s + (v.commentsCount || 0), 0);

    // 1. Engagement rate — (likes + comments) / views. ~6% reads as elite.
    const engRate = totalViews > 0 ? (totalLikes + totalComments) / totalViews : null;
    const engagement: Metric = {
      key: 'engagement',
      label: 'Engagement Rate',
      score: engRate === null ? null : clamp((engRate / 0.06) * 100),
      value: engRate === null ? 'No views yet' : `${(engRate * 100).toFixed(1)}%`,
      tip: 'Pose a question in your pinned comment to pull viewers into the thread.',
      weight: 0.25,
    };

    // 2. Like ratio — likes / views. ~4.5% is strong.
    const likeRate = totalViews > 0 ? totalLikes / totalViews : null;
    const likeRatio: Metric = {
      key: 'likeRatio',
      label: 'Like Ratio',
      score: likeRate === null ? null : clamp((likeRate / 0.045) * 100),
      value: likeRate === null ? 'No views yet' : `${(likeRate * 100).toFixed(1)}%`,
      tip: 'Drop a natural like-reminder right after your video\'s best moment.',
      weight: 0.15,
    };

    // 3. Reply rate — share of comments the creator answered. 50%+ is great.
    const replied = comments.filter(c => (c.reply || '').trim().length > 0).length;
    const replyRate = comments.length > 0 ? replied / comments.length : null;
    const reply: Metric = {
      key: 'reply',
      label: 'Reply Rate',
      score: replyRate === null ? null : clamp((replyRate / 0.5) * 100),
      value: replyRate === null ? 'No comments yet' : `${Math.round(replyRate * 100)}% answered`,
      tip: 'Answer your newest 5 comments within an hour of publishing.',
      weight: 0.15,
    };

    // 4. Upload cadence — frequency + recency of uploads.
    let cadence: Metric = {
      key: 'cadence', label: 'Upload Cadence', score: null, value: 'Need 2+ videos',
      tip: 'Lock a consistent upload day your audience can count on.', weight: 0.2,
    };
    if (videos.length >= 2) {
      const times = videos.map(v => new Date(v.createdAt).getTime()).sort((a, b) => a - b);
      const gaps: number[] = [];
      for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / DAY_MS);
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      const daysSinceLast = (Date.now() - times[times.length - 1]) / DAY_MS;
      const freqScore = clamp((7 / Math.max(avgGap, 0.5)) * 100);
      const recencyScore = clamp(100 - Math.max(0, daysSinceLast - 7) * 3);
      cadence = {
        ...cadence,
        score: clamp((freqScore + recencyScore) / 2),
        value: `${avgGap.toFixed(0)}d avg gap · last ${daysSinceLast.toFixed(0)}d ago`,
      };
    }

    // 5. Growth momentum — recent vs prior half of the analytics window.
    let momentum: Metric = {
      key: 'momentum', label: 'Growth Momentum', score: null, value: 'No analytics yet',
      tip: 'Lean into the topics behind your most recent view spikes.', weight: 0.25,
    };
    const sorted = [...analytics].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const half = Math.floor(sorted.length / 2);
    if (half > 0) {
      const recent = sorted.slice(-half).reduce((s, d) => s + (d.views || 0), 0);
      const prior = sorted.slice(0, half).reduce((s, d) => s + (d.views || 0), 0);
      if (recent + prior > 0) {
        if (prior === 0) {
          momentum = { ...momentum, score: 85, value: 'New growth' };
        } else {
          const delta = ((recent - prior) / prior) * 100;
          momentum = {
            ...momentum,
            score: clamp(50 + delta / 2),
            value: `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}% views`,
          };
        }
      }
    }

    const list = [engagement, likeRatio, reply, cadence, momentum];
    const scored = list.filter(m => m.score !== null);
    const totalWeight = scored.reduce((s, m) => s + m.weight, 0);
    const composite = totalWeight > 0
      ? Math.round(scored.reduce((s, m) => s + (m.score as number) * m.weight, 0) / totalWeight)
      : null;

    return { overall: composite, metrics: list };
  }, [videos, comments, analytics]);

  const runCoach = async () => {
    if (overall === null) return;
    setIsCoaching(true);
    setCoachError(null);
    setCoach(null);
    try {
      const res = await authedFetch('/api/channel-coach', {
        method: 'POST',
        body: JSON.stringify({
          score: overall,
          channelName: channel?.name,
          metrics: metrics
            .filter(m => m.score !== null)
            .map(m => ({ label: m.label, score: m.score, value: m.value })),
        }),
      });
      if (!res.ok) throw new Error(await readServerError(res, 'Failed to generate your growth plan.'));
      const data = await res.json();
      setCoach({ summary: data.summary || '', actions: Array.isArray(data.actions) ? data.actions.slice(0, 3) : [] });
    } catch (err: any) {
      setCoachError(err.message || 'Something went wrong generating your plan.');
    } finally {
      setIsCoaching(false);
    }
  };

  if (!channel) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8">
        <HeartPulse className="w-12 h-12 text-red-500 mb-4 animate-pulse" />
        <p className="text-gray-400 font-sans text-sm">Loading channel diagnostics...</p>
      </div>
    );
  }

  const hasData = overall !== null;
  const gaugeBand = hasData ? band(overall as number) : { label: 'No data', color: '#6b7280' };

  // Gauge geometry.
  const R = 54;
  const CIRC = 2 * Math.PI * R;
  const offset = hasData ? CIRC * (1 - (overall as number) / 100) : CIRC;

  return (
    <div className="space-y-6 animate-fade-in" id="channel-health-container">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-950/30 via-[#1e1e1e] to-[#1e1e1e] border border-[#333] rounded-md p-6 flex items-center gap-4">
        <div className="p-3 rounded-sm bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 flex-shrink-0">
          <HeartPulse className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold font-sans text-white tracking-tight">Channel Health Score</h1>
          <p className="text-xs text-gray-400 font-sans mt-0.5 max-w-xl leading-relaxed">
            A live diagnostic built from your real videos, comments, and analytics — five vital signs rolled into
            one score, with an AI coach that prescribes what to fix first.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Gauge (left) */}
        <div className="lg:col-span-4 bg-[#1e1e1e] border border-[#333] rounded-md p-6 flex flex-col items-center">
          <div className="relative w-[140px] h-[140px]">
            <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
              <circle cx="70" cy="70" r={R} fill="none" stroke="#282828" strokeWidth="12" />
              {hasData && (
                <circle
                  cx="70" cy="70" r={R} fill="none" stroke={gaugeBand.color} strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={CIRC} strokeDashoffset={offset}
                  style={{ transition: 'stroke-dashoffset 900ms ease-out' }}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-light tracking-tight text-white">{hasData ? overall : '—'}</span>
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: gaugeBand.color }}>{gaugeBand.label}</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 font-sans text-center mt-4 leading-relaxed">
            {hasData
              ? 'Weighted across engagement, likes, replies, cadence and momentum.'
              : 'Connect and sync your channel (or seed the sandbox) to compute a score.'}
          </p>

          <button
            onClick={runCoach}
            disabled={!hasData || isCoaching}
            className="mt-5 w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-gray-500 text-white text-xs font-bold font-sans rounded-sm tracking-wider uppercase transition-all shadow flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {isCoaching ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Diagnosing...</>
            ) : (
              <><Zap className="w-4 h-4" /> Get AI Growth Plan</>
            )}
          </button>
          {coachError && (
            <div className="mt-3 w-full p-3 bg-red-950/20 border border-red-900/30 text-red-400 text-[11px] rounded-sm font-sans">{coachError}</div>
          )}
        </div>

        {/* Vital signs (right) */}
        <div className="lg:col-span-8 bg-[#1e1e1e] border border-[#333] rounded-md p-6 space-y-4">
          <h3 className="text-sm font-bold font-sans text-white uppercase tracking-wider flex items-center gap-2">
            <Target className="w-4 h-4 text-[#3ea6ff]" /> Vital Signs
          </h3>
          <div className="space-y-4">
            {metrics.map((m) => {
              const b = m.score === null ? { label: 'No data', color: '#6b7280' } : band(m.score);
              return (
                <div key={m.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold font-sans text-white">{m.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-[#aaa]">{m.value}</span>
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border"
                        style={{ color: b.color, borderColor: `${b.color}40`, backgroundColor: `${b.color}1a` }}>
                        {m.score === null ? '—' : `${m.score}`}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-[#0f0f0f] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${m.score === null ? 0 : Math.max(2, m.score)}%`, backgroundColor: b.color }} />
                  </div>
                  <p className="text-[10px] text-gray-500 font-sans italic">{m.tip}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Coach plan */}
      {coach && (
        <div className="bg-[#1e1e1e] border border-emerald-500/25 rounded-md p-6 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold font-sans text-white uppercase tracking-wider">Your Growth Prescription</h3>
          </div>
          {coach.summary && <p className="text-xs text-gray-300 font-sans leading-relaxed">{coach.summary}</p>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {coach.actions.map((a, idx) => (
              <div key={idx} className="bg-[#0f0f0f] border border-[#333] rounded-sm p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 flex items-center justify-center text-[11px] font-bold font-mono bg-emerald-500 text-black rounded-sm">{idx + 1}</span>
                  <h4 className="text-xs font-bold font-sans text-white leading-snug">{a.title}</h4>
                </div>
                <p className="text-[11px] text-gray-400 font-sans leading-relaxed">{a.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
