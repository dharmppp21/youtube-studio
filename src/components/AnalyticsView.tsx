import React, { useState } from 'react';
import { Video, AnalyticsSnapshot } from '../types';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Eye, Clock, Users, DollarSign, 
  Video as VideoIcon, Sparkles, Activity, Award 
} from 'lucide-react';

interface AnalyticsViewProps {
  analytics: AnalyticsSnapshot[];
  videos: Video[];
}

export default function AnalyticsView({ analytics, videos }: AnalyticsViewProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'audience' | 'revenue'>('overview');

  // Format data for Recharts
  const sortedAnalytics = [...analytics].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Format numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  };

  // Aggregated totals in 30 days
  const totals = sortedAnalytics.reduce((acc, curr) => {
    acc.views += curr.views;
    acc.watchTime += curr.watchTime;
    acc.revenue += curr.revenue;
    acc.subscribers += curr.subscribers;
    return acc;
  }, { views: 0, watchTime: 0, revenue: 0, subscribers: 0 });

  // Pie chart demographic data
  const trafficSourceData = [
    { name: 'YouTube Search', value: 45 },
    { name: 'Suggested Videos', value: 25 },
    { name: 'Browse Features', value: 18 },
    { name: 'Direct/Unknown', value: 12 },
  ];
  const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b'];

  // Bar chart video data
  const videoBarData = [...videos]
    .sort((a, b) => b.views - a.views)
    .slice(0, 5)
    .map(v => ({
      name: v.title.length > 20 ? v.title.slice(0, 20) + '...' : v.title,
      views: v.views,
      likes: v.likes,
      revenue: v.revenue
    }));

  return (
    <div className="space-y-6" id="analytics-container">
      {/* Analytics Tabs */}
      <div className="flex border-b border-[#333] gap-2 overflow-x-auto pb-px" id="analytics-tab-header">
        {(['overview', 'content', 'audience', 'revenue'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 text-sm font-medium font-sans border-b-2 transition-all capitalize whitespace-nowrap cursor-pointer ${
              activeTab === tab
                ? 'border-red-500 text-white font-bold bg-[#1e1e1e]'
                : 'border-transparent text-[#aaa] hover:text-white hover:bg-[#1e1e1e]/40'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Main Aggregated cards (overview status) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="analytics-summary-cards">
        <div className="bg-[#1e1e1e] border border-[#333] rounded-md p-5 space-y-2">
          <div className="flex items-center gap-2 text-[#aaa] text-xs font-sans font-medium">
            <Eye className="w-4 h-4 text-red-500" />
            <span>Views Gained</span>
          </div>
          <h2 className="text-3xl font-light font-sans text-white">{formatNumber(totals.views)}</h2>
          <span className="text-[10px] font-mono text-green-500 flex items-center gap-0.5">
            <TrendingUp className="w-3.5 h-3.5" /> +14.2% (vs last 30 days)
          </span>
        </div>

        <div className="bg-[#1e1e1e] border border-[#333] rounded-md p-5 space-y-2">
          <div className="flex items-center gap-2 text-[#aaa] text-xs font-sans font-medium">
            <Clock className="w-4 h-4 text-[#3ea6ff]" />
            <span>Watch Time Hours</span>
          </div>
          <h2 className="text-3xl font-light font-sans text-white">{formatNumber(totals.watchTime)}</h2>
          <span className="text-[10px] font-mono text-green-500 flex items-center gap-0.5">
            <TrendingUp className="w-3.5 h-3.5" /> +8.6% (vs last 30 days)
          </span>
        </div>

        <div className="bg-[#1e1e1e] border border-[#333] rounded-md p-5 space-y-2">
          <div className="flex items-center gap-2 text-[#aaa] text-xs font-sans font-medium">
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Subscribers Added</span>
          </div>
          <h2 className="text-3xl font-light font-sans text-white">+{formatNumber(totals.subscribers)}</h2>
          <span className="text-[10px] font-mono text-green-500 flex items-center gap-0.5">
            <TrendingUp className="w-3.5 h-3.5" /> +21.4% (vs last 30 days)
          </span>
        </div>

        <div className="bg-[#1e1e1e] border border-[#333] rounded-md p-5 space-y-2">
          <div className="flex items-center gap-2 text-[#aaa] text-xs font-sans font-medium">
            <DollarSign className="w-4 h-4 text-amber-400" />
            <span>Estimated Earnings</span>
          </div>
          <h2 className="text-3xl font-light font-sans text-white">{formatCurrency(totals.revenue)}</h2>
          <span className="text-[10px] font-mono text-green-500 flex items-center gap-0.5">
            <TrendingUp className="w-3.5 h-3.5" /> +15.5% (vs last 30 days)
          </span>
        </div>
      </div>

      {/* Conditional Rendering of Tab views */}
      <div className="bg-[#1e1e1e] border border-[#333] rounded-md p-6" id="analytics-visual-canvas">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
              <div className="space-y-1">
                <h3 className="text-lg font-bold font-sans text-white">Views & Watch Time Trajectory</h3>
                <p className="text-xs text-[#aaa] font-sans">A daily breakdown of traffic and watch hours over the past 30 days.</p>
              </div>
              <div className="flex items-center gap-2 p-1.5 bg-[#0f0f0f] border border-[#333] rounded-sm">
                <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-[#3ea6ff] px-2.5 py-1 bg-[#3ea6ff]/10 border border-[#3ea6ff]/20 rounded-sm">
                  <Activity className="w-3.5 h-3.5" /> Real-time tracking
                </span>
              </div>
            </div>

            <div className="h-80 w-full" id="overview-recharts-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={sortedAnalytics}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorWatch" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3ea6ff" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#3ea6ff" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#6b7280" 
                    tickFormatter={(val) => {
                      const parts = val.split('-');
                      return parts[1] + '/' + parts[2];
                    }}
                    style={{ fontSize: 10, fontFamily: 'monospace' }}
                  />
                  <YAxis stroke="#6b7280" style={{ fontSize: 10, fontFamily: 'monospace' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333', color: '#fff' }}
                    labelStyle={{ color: '#9ca3af', fontFamily: 'monospace' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'sans-serif', paddingTop: 10 }} />
                  <Area type="monotone" dataKey="views" name="Daily Views" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorViews)" />
                  <Area type="monotone" dataKey="watchTime" name="Watch Time (Hours)" stroke="#3ea6ff" strokeWidth={2} fillOpacity={1} fill="url(#colorWatch)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'content' && (
          <div className="space-y-6">
            <div className="space-y-1 mb-4">
              <h3 className="text-lg font-bold font-sans text-white">Top 5 Videos performance</h3>
              <p className="text-xs text-[#aaa] font-sans">Comparative breakdown of your most popular uploads based on accumulated views and likes.</p>
            </div>

            <div className="h-80 w-full" id="content-bar-chart-container">
              {videoBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={videoBarData}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: 10, fontFamily: 'sans-serif' }} />
                    <YAxis stroke="#6b7280" style={{ fontSize: 10, fontFamily: 'monospace' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333', color: '#fff' }} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'sans-serif', paddingTop: 10 }} />
                    <Bar dataKey="views" name="Total Views" fill="#ef4444" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="likes" name="Likes Gained" fill="#3ea6ff" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[#aaa] text-xs">
                  No video performance logs found.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'audience' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Traffic Source Pie Chart */}
            <div className="lg:col-span-6 space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold font-sans text-white">Traffic Source Types</h4>
                <p className="text-xs text-[#aaa] font-sans">Where viewers discover your content.</p>
              </div>
              <div className="h-64 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={trafficSourceData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {trafficSourceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333', color: '#fff' }} />
                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11, fontFamily: 'sans-serif' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Subscriber Growth trend over 30 days */}
            <div className="lg:col-span-6 space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold font-sans text-white">Net Subscriber Gains</h4>
                <p className="text-xs text-[#aaa] font-sans">Daily conversion rate of visitors to subscribers.</p>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sortedAnalytics} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSubs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#6b7280" 
                      tickFormatter={(val) => {
                        const parts = val.split('-');
                        return parts[1] + '/' + parts[2];
                      }}
                      style={{ fontSize: 9, fontFamily: 'monospace' }}
                    />
                    <YAxis stroke="#6b7280" style={{ fontSize: 9, fontFamily: 'monospace' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333', color: '#fff' }} />
                    <Area type="monotone" dataKey="subscribers" name="Subscribers Added" stroke="#10b981" fillOpacity={1} fill="url(#colorSubs)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'revenue' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-lg font-bold font-sans text-white">Estimated Ad Revenue & Earnings</h3>
                <p className="text-xs text-[#aaa] font-sans">Daily revenue curve mapping CPM monetization and premium partner shares.</p>
              </div>
              <div className="flex items-center gap-2 p-1.5 bg-amber-950/20 border border-amber-900/30 rounded-sm text-amber-400 text-xs font-semibold">
                <Award className="w-4 h-4" /> Average RPM: $3.45 / 1K views
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sortedAnalytics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#6b7280" 
                    tickFormatter={(val) => {
                      const parts = val.split('-');
                      return parts[1] + '/' + parts[2];
                    }}
                    style={{ fontSize: 9, fontFamily: 'monospace' }}
                  />
                  <YAxis stroke="#6b7280" style={{ fontSize: 9, fontFamily: 'monospace' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333', color: '#fff' }} />
                  <Area type="monotone" dataKey="revenue" name="Estimated Revenue ($)" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Video earning table */}
            <div className="border border-[#333] rounded-md overflow-hidden mt-4">
              <div className="bg-[#282828] px-4 py-3 border-b border-[#333]">
                <h4 className="text-xs font-bold font-sans text-white uppercase tracking-wider">Top Earners Video Roster</h4>
              </div>
              <div className="divide-y divide-[#333] overflow-x-auto text-[#aaa]">
                {[...videos]
                  .sort((a, b) => b.revenue - a.revenue)
                  .map((v) => (
                    <div key={v.id} className="flex items-center justify-between px-4 py-3 gap-4 min-w-[500px] hover:bg-[#282828]/25 transition-all">
                      <div className="flex items-center gap-3 w-1/2">
                        <img 
                          src={v.thumbnailUrl} 
                          alt={v.title} 
                          className="w-16 aspect-video rounded-sm object-cover border border-[#333] flex-shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold font-sans text-white line-clamp-1">{v.title}</p>
                          <span className="text-[10px] font-mono text-[#aaa]">{new Date(v.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="w-1/4 text-right">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-[#aaa]">Views</span>
                        <p className="text-xs font-semibold font-sans text-white mt-0.5">{formatNumber(v.views)}</p>
                      </div>
                      <div className="w-1/4 text-right">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-[#aaa]">Revenue</span>
                        <p className="text-xs font-bold font-sans text-amber-400 mt-0.5">{formatCurrency(v.revenue)}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
