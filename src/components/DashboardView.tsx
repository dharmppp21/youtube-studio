import React from 'react';
import { Channel, Video, Comment } from '../types';
import {
  Users, Eye, Clock, DollarSign,
  Video as VideoIcon, PlusCircle, Sparkles, AlertCircle,
  Play, Loader2, RefreshCw, Settings, Activity
} from 'lucide-react';
import DeltaBadge from './DeltaBadge';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { authedFetch } from '../firebase';
import { formatNumber, formatCurrency } from '../format';

const initialTrendData = [
  { topic: 'AI Setup', x: 80, y: 120, z: 240, fill: '#3ea6ff' },
  { topic: 'Gaming PC', x: 40, y: 60, z: 150, fill: '#f59e0b' },
  { topic: 'Productivity Hacks', x: 60, y: 80, z: 100, fill: '#10b981' },
  { topic: 'Crypto Basics', x: 20, y: 40, z: 120, fill: '#8b5cf6' },
  { topic: 'Tech Reviews', x: 50, y: 100, z: 180, fill: '#ef4444' },
  { topic: 'Studio Tour', x: 75, y: 45, z: 160, fill: '#ec4899' },
  { topic: 'Desk Setup', x: 30, y: 90, z: 130, fill: '#06b6d4' }
];

const TrendTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#1e1e1e]/90 backdrop-blur-sm border border-[#333] p-3 rounded-sm shadow-xl">
        <p className="text-white font-bold font-sans text-xs">{data.topic}</p>
        <p className="text-[#3ea6ff] font-mono text-[10px] mt-1">Search Vol: {data.z}k</p>
        <p className="text-emerald-400 font-mono text-[9px]">Momentum: +{data.y}%</p>
      </div>
    );
  }
  return null;
};

interface DashboardViewProps {
  channel: Channel | null;
  videos: Video[];
  comments: Comment[];
  onNavigate: (tab: string) => void;
  onOpenUploadModal: () => void;
  googleAccessToken: string | null;
  isSyncingYT: boolean;
  syncStatusMsg: string | null;
  onConnectYouTube: () => void;
  onRetrySync: () => Promise<void>;
  isSandbox?: boolean;
}

export default function DashboardView({
  channel,
  videos,
  comments,
  onNavigate,
  onOpenUploadModal,
  googleAccessToken,
  isSyncingYT,
  syncStatusMsg,
  onConnectYouTube,
  onRetrySync,
  isSandbox
}: DashboardViewProps) {
  const [trendData, setTrendData] = React.useState<any[]>(initialTrendData);
  const [isLoadingTrends, setIsLoadingTrends] = React.useState(false);

  React.useEffect(() => {
    if (!channel) return;
    let mounted = true;
    
    const fetchTrends = async () => {
      setIsLoadingTrends(true);
      try {
        const res = await authedFetch('/api/generate-trends', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ niche: channel.category })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.trends && Array.isArray(data.trends) && mounted) {
            setTrendData(data.trends);
          }
        }
      } catch (err) {
        console.error('Failed to fetch real-time trends:', err);
      } finally {
        if (mounted) setIsLoadingTrends(false);
      }
    };
    
    fetchTrends();
    return () => { mounted = false; };
    // Depend on the niche string, not the `channel` object: the Firestore
    // onSnapshot listener replaces `channel` with a new object on every doc
    // update, which would otherwise re-fire this paid Gemini call each time.
  }, [channel?.category]);

  if (!channel) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4 animate-pulse" />
        <p className="text-gray-400 font-sans text-sm">Loading your channel dashboard data...</p>
      </div>
    );
  }

  // Get latest video
  const sortedVideos = [...videos].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latestVideo = sortedVideos[0];

  // Get recent unanswered comments
  const recentComments = comments
    .filter(c => !c.reply)
    .slice(0, 3);

  return (
    <div className="space-y-6" id="dashboard-container">
      {/* Real-time YouTube Connection Banner */}
      <div className="bg-[#1e1e1e] border border-[#333] rounded-md p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-4">
          <div className="p-3 rounded-sm bg-red-600/10 border border-red-500/20 text-red-500 flex-shrink-0 animate-pulse">
            <Play className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-white font-sans">YouTube Live Integration</h2>
              {googleAccessToken ? (
                <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-green-500/10 border border-green-500/20 text-green-400 rounded-sm">
                  ● LIVE CHANNEL ACTIVE
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-sm">
                  ● CACHED / DEMO
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed font-sans max-w-xl">
              {googleAccessToken 
                ? `Your workspace is securely linked to YouTube Channel: "${channel.name}". Sync updates to retrieve fresh uploads, comments, and analytics.`
                : "Currently displaying simulated channel workspace assets. Connect your real YouTube account with Google OAuth to retrieve your live uploads, stats, and viewer comments!"
              }
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2 flex-shrink-0 w-full sm:w-auto">
          <button
            onClick={() => onNavigate('settings')}
            className="w-full sm:w-auto px-4 py-2 bg-[#282828] hover:bg-[#333] border border-[#444] text-white font-bold rounded-sm text-xs transition-colors font-sans flex items-center justify-center gap-2 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-red-500" />
            Customize Channel & Stats
          </button>

          {isSyncingYT ? (
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 px-3 py-2 w-full sm:w-auto bg-[#1a1a1a] rounded-sm border border-[#333]">
              <Loader2 className="w-4 h-4 animate-spin text-red-500" />
              <span className="font-mono text-[11px] text-gray-300">{syncStatusMsg || 'Syncing...'}</span>
            </div>
          ) : (
            <>
              {googleAccessToken && (
                <button
                  onClick={onRetrySync}
                  className="w-full sm:w-auto px-3 py-2 bg-[#1a1a1a] hover:bg-[#282828] border border-[#333] text-gray-300 hover:text-white text-[11px] font-bold rounded-sm transition-colors font-sans flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Re-run sync using the cached Google session"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry Sync
                </button>
              )}
              <button
                onClick={onConnectYouTube}
                className={`w-full sm:w-auto px-4 py-2 font-bold rounded-sm text-xs transition-colors font-sans flex items-center justify-center gap-2 cursor-pointer ${
                  googleAccessToken
                    ? 'bg-[#282828] hover:bg-[#333] border border-[#444] text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {googleAccessToken ? 'Re-authorize Google' : 'Connect Channel'}
              </button>
            </>
          )}
        </div>
      </div>
      {/* Overview stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Subscribers */}
        <div className="bg-[#1e1e1e] border border-[#333] rounded-md p-5 hover:border-[#555] transition-all" id="stat-card-subscribers">
          <div className="flex items-center justify-between">
            <span className="text-xs font-sans text-[#aaa] uppercase tracking-wider font-medium">Subscribers</span>
            <div className="p-2 bg-[#282828] border border-[#333] rounded-sm">
              <Users className="w-4 h-4 text-red-500" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-light tracking-tight text-white">{formatNumber(channel.subscribers)}</h3>
            <DeltaBadge delta={null} label="live count" />
          </div>
        </div>

        {/* Views */}
        <div className="bg-[#1e1e1e] border border-[#333] rounded-md p-5 hover:border-[#555] transition-all" id="stat-card-views">
          <div className="flex items-center justify-between">
            <span className="text-xs font-sans text-[#aaa] uppercase tracking-wider font-medium">Channel Views</span>
            <div className="p-2 bg-[#282828] border border-[#333] rounded-sm">
              <Eye className="w-4 h-4 text-[#3ea6ff]" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-light tracking-tight text-white">{formatNumber(channel.views)}</h3>
            <DeltaBadge delta={null} label="live count" />
          </div>
        </div>

        {/* Watch Time — always shown, real value */}
        <div className="bg-[#1e1e1e] border border-[#333] rounded-md p-5 hover:border-[#555] transition-all" id="stat-card-watchtime">
          <div className="flex items-center justify-between">
            <span className="text-xs font-sans text-[#aaa] uppercase tracking-wider font-medium">Watch Time (Hours)</span>
            <div className="p-2 bg-[#282828] border border-[#333] rounded-sm">
              <Clock className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-light tracking-tight text-white">{formatNumber(channel.watchTime)}</h3>
            <DeltaBadge delta={null} label="live count" />
          </div>
        </div>

        {/* Revenue — always shown, real value */}
        <div className="bg-[#1e1e1e] border border-[#333] rounded-md p-5 hover:border-[#555] transition-all" id="stat-card-revenue">
          <div className="flex items-center justify-between">
            <span className="text-xs font-sans text-[#aaa] uppercase tracking-wider font-medium">Est. Revenue</span>
            <div className="p-2 bg-[#282828] border border-[#333] rounded-sm">
              <DollarSign className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-light tracking-tight text-white">{formatCurrency(channel.revenue)}</h3>
            <DeltaBadge delta={null} label="live count" />
          </div>
        </div>
      </div>

      {/* Grid: Latest Video Performance & Recent Comments */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Latest Video Card (Left Col - 7/12) */}
        <div className="lg:col-span-7 bg-[#1e1e1e] border border-[#333] rounded-md p-6 space-y-5" id="latest-video-dashboard-card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-sans text-white tracking-tight">Latest Video Performance</h2>
            <button 
              onClick={() => onNavigate('content')}
              className="text-xs font-sans text-[#3ea6ff] hover:underline font-medium transition-colors cursor-pointer"
            >
              Go to Videos
            </button>
          </div>

          {latestVideo ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative w-full sm:w-48 aspect-video rounded-sm overflow-hidden border border-[#333] flex-shrink-0">
                  <img 
                    src={latestVideo.thumbnailUrl} 
                    alt={latestVideo.title} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/85 rounded-sm text-[10px] font-mono text-white">
                    {latestVideo.duration}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className={`px-2 py-0.5 text-[10px] font-mono rounded-sm font-medium ${
                    latestVideo.visibility === 'public' ? 'bg-[#282828] border border-[#333] text-green-500' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {latestVideo.visibility.toUpperCase()}
                  </span>
                  <h3 className="text-sm font-bold font-sans text-white leading-snug line-clamp-2 mt-2">
                    {latestVideo.title}
                  </h3>
                  <p className="text-xs text-[#aaa] font-sans line-clamp-2 mt-1">
                    {latestVideo.description}
                  </p>
                </div>
              </div>

              {/* Stats detail list */}
              <div className="grid grid-cols-3 gap-2 border-t border-[#333] pt-4" id="latest-video-stats">
                <div className="text-center sm:text-left">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-[#aaa]">Views</span>
                  <p className="text-base font-bold font-sans text-white mt-0.5">{formatNumber(latestVideo.views)}</p>
                </div>
                <div className="text-center sm:text-left">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-[#aaa]">Likes</span>
                  <p className="text-base font-bold font-sans text-white mt-0.5">{formatNumber(latestVideo.likes)}</p>
                </div>
                <div className="text-center sm:text-left">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-[#aaa]">Comments</span>
                  <p className="text-base font-bold font-sans text-white mt-0.5">{latestVideo.commentsCount}</p>
                </div>
              </div>

              {/* Tips for growth based on performance */}
              <div className="p-4 bg-[#282828] border border-[#333] rounded-sm flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5 animate-pulse" />
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold font-sans text-white">AI Suggestion for CTR Optimization</h4>
                  <p className="text-[11px] text-gray-300 leading-relaxed font-sans">
                    Your view-to-impression ratio is running higher than average! Boost it even more by using the <span className="font-semibold text-[#3ea6ff]">SEO Optimizer</span> tool to write a click-magnet description.
                  </p>
                </div>
              </div>
            </div>
          ) : !isSandbox && !googleAccessToken ? (
            // Real Google user who hasn't connected YouTube yet.
            // Don't push them to upload — they have no channel data at all.
            <div className="flex flex-col items-center justify-center py-12 text-center bg-red-950/10 border border-dashed border-red-900/30 rounded-sm space-y-3">
              <Play className="w-8 h-8 text-red-500 mb-1" />
              <p className="text-sm font-semibold font-sans text-white">Connect your YouTube channel</p>
              <p className="text-[11px] text-gray-400 font-sans max-w-xs leading-relaxed">
                Your workspace is ready, but no channel data has loaded yet. Click below to securely link your YouTube account — we'll pull your live uploads, stats, and viewer comments.
              </p>
              <button
                onClick={onConnectYouTube}
                className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-xs text-white font-bold rounded-sm transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Connect Channel
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-[#282828]/20 border border-dashed border-[#333] rounded-sm">
              <VideoIcon className="w-8 h-8 text-gray-500 mb-2" />
              <p className="text-sm font-medium text-gray-300 font-sans">No videos uploaded yet</p>
              <button
                onClick={onOpenUploadModal}
                className="mt-4 px-4 py-2 bg-[#3ea6ff] hover:opacity-90 text-xs text-[#0f0f0f] font-bold rounded-sm transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Upload First Video
              </button>
            </div>
          )}
        </div>

        {/* Recent comments & creator feed (Right Col - 5/12) */}
        <div className="lg:col-span-5 bg-[#1e1e1e] border border-[#333] rounded-md p-6 flex flex-col justify-between" id="recent-comments-dashboard-card">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold font-sans text-white tracking-tight">Recent Comments</h2>
              <button 
                onClick={() => onNavigate('comments')}
                className="text-xs font-sans text-[#3ea6ff] hover:underline font-medium transition-colors cursor-pointer"
              >
                View All ({comments.length})
              </button>
            </div>

            <div className="space-y-4">
              {recentComments.length > 0 ? (
                recentComments.map((comment) => (
                  <div key={comment.id} className="p-3 bg-[#282828] border border-[#333] rounded-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img 
                          src={comment.authorAvatarUrl} 
                          alt={comment.authorName} 
                          className="w-5 h-5 rounded-full bg-zinc-800"
                          referrerPolicy="no-referrer"
                        />
                        <span className="text-[11px] font-bold font-sans text-gray-200">{comment.authorName}</span>
                      </div>
                      <span className="text-[9px] font-mono text-[#aaa]">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-300 font-sans line-clamp-2 leading-relaxed">
                      "{comment.content}"
                    </p>
                    <div className="flex items-center gap-2 pt-1 text-[10px] text-[#aaa] font-mono">
                      <span className="flex items-center gap-0.5">
                        <Eye className="w-3 h-3" /> on {comment.videoTitle.slice(0, 20)}...
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-[#aaa] font-sans text-xs">
                  All caught up! No recent comments to reply to.
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#333]">
            <div className="p-3 bg-[#282828] rounded-sm border border-[#333] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#3ea6ff] animate-pulse" />
                <span className="text-[11px] text-gray-200 font-sans font-medium">Use AI Studio Assistant</span>
              </div>
              <button 
                onClick={() => onNavigate('assistant')}
                className="px-3 py-1.5 bg-[#3ea6ff] hover:opacity-90 text-[10px] font-bold text-[#0f0f0f] uppercase tracking-wider rounded-sm transition-all font-sans cursor-pointer"
              >
                Go AI
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feature 2: Viral Trend Radar */}
      <div className="bg-[#1e1e1e] border border-[#333] rounded-md p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold font-sans text-white tracking-tight">Viral Trend Radar</h2>
          </div>
          <button 
            onClick={() => onNavigate('assistant')}
            className="px-4 py-2 bg-[#282828] hover:bg-[#333] border border-[#444] text-white font-bold rounded-sm text-xs transition-colors font-sans flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-black/20"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#3ea6ff]" />
            Brainstorm Ideas
          </button>
        </div>
        
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 h-[250px] bg-[#0f0f0f] border border-[#333] rounded-sm relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#3ea6ff]/10 via-transparent to-transparent pointer-events-none"></div>
            
            {isLoadingTrends && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0f0f0f]/80 backdrop-blur-sm z-10">
                <Loader2 className="w-8 h-8 text-[#3ea6ff] animate-spin mb-2" />
                <p className="text-xs text-gray-400 font-sans animate-pulse">Scanning live trends for {channel.category}...</p>
              </div>
            )}

            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <XAxis type="number" dataKey="x" name="Competition" hide />
                <YAxis type="number" dataKey="y" name="Momentum" hide />
                <ZAxis type="number" dataKey="z" range={[100, 1500]} name="Volume" />
                <Tooltip content={<TrendTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#444' }} />
                <Scatter name="Trends" data={trendData} shape="circle">
                  {trendData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} className="drop-shadow-lg cursor-pointer hover:opacity-80 transition-opacity" />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="w-full md:w-64 space-y-4">
            <h3 className="text-xs font-bold font-sans text-gray-400 uppercase tracking-wider">Top Rising Topics</h3>
            {trendData.slice(0, 4).map((trend, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 bg-[#0f0f0f] border border-[#333] rounded-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: trend.fill }}></div>
                  <span className="text-[11px] font-bold font-sans text-white">{trend.topic}</span>
                </div>
                <span className="text-[9px] font-mono text-emerald-400">+{trend.y}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
