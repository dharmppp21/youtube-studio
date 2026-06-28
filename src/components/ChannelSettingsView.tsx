import React, { useState } from 'react';
import { Channel, Video, AnalyticsSnapshot } from '../types';
import { doc, setDoc, writeBatch, collection, getDocs, query, where, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { seedChannelData } from '../seedData';
import { 
  Settings, User, BarChart2, ShieldAlert, CheckCircle, RefreshCw, Trash2, 
  Sparkles, FileText, PlusCircle, LayoutDashboard, ChevronRight
} from 'lucide-react';

interface ChannelSettingsViewProps {
  channel: Channel;
  user: any;
  videos: Video[];
  analytics: AnalyticsSnapshot[];
  onNavigate: (tab: string) => void;
}

export default function ChannelSettingsView({ channel, user, videos, analytics, onNavigate }: ChannelSettingsViewProps) {
  // Tabs inside Settings
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'analytics_gen' | 'data_reset'>('profile');

  // Profile Form State
  const [name, setName] = useState(channel.name);
  const [handle, setHandle] = useState(channel.handle);
  const [description, setDescription] = useState(channel.description);
  const [avatarUrl, setAvatarUrl] = useState(channel.avatarUrl);
  const [category, setCategory] = useState(channel.category);
  const [subscribers, setSubscribers] = useState(channel.subscribers);
  const [views, setViews] = useState(channel.views);
  const [watchTime, setWatchTime] = useState(channel.watchTime);
  const [revenue, setRevenue] = useState(channel.revenue);

  // Status message states
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Analytics generator parameters
  const [avgDailyViews, setAvgDailyViews] = useState(500);
  const [avgDailySubs, setAvgDailySubs] = useState(10);
  const [avgDailyWatch, setAvgDailyWatch] = useState(1200); // in minutes
  const [avgDailyRev, setAvgDailyRev] = useState(4.5); // USD

  // Handler: Update channel profile
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);
    setSaveSuccess(null);

    try {
      const channelRef = doc(db, 'channels', user.uid);
      const updatedChannel: Channel = {
        ...channel,
        name,
        handle: handle.startsWith('@') ? handle : '@' + handle,
        description,
        avatarUrl,
        category,
        subscribers: Number(subscribers),
        views: Number(views),
        watchTime: Number(watchTime),
        revenue: Number(revenue)
      };

      await setDoc(channelRef, updatedChannel);
      setSaveSuccess("Channel profile updated successfully!");
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err) {
      console.error("Failed to update channel profile:", err);
      alert("Error saving profile changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Handler: Bulk generate custom daily analytics trajectory
  const handleGenerateAnalytics = async () => {
    if (!user) return;
    setIsSaving(true);
    setSaveSuccess(null);

    try {
      const batch = writeBatch(db);
      
      // 1. Delete all existing analytics docs for this user
      const q = query(collection(db, 'analytics'), where('ownerId', '==', user.uid));
      const snap = await getDocs(q);
      snap.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // 2. Generate 30 days of custom daily trajectory
      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() - 30);
      
      let totalViews = 0;
      let totalSubs = 0;
      let totalWatchMinutes = 0;
      let totalRev = 0;

      for (let i = 0; i < 30; i++) {
        const dateStr = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        // Add slight authentic fluctuations
        const fluctuation = 0.7 + Math.random() * 0.6; // 70% to 130%
        const dayViews = Math.max(1, Math.floor(avgDailyViews * fluctuation));
        const daySubs = Math.max(0, Math.floor(avgDailySubs * fluctuation));
        const dayWatch = Math.max(1, Math.floor(avgDailyWatch * fluctuation));
        const dayRev = parseFloat((avgDailyRev * fluctuation).toFixed(2));

        totalViews += dayViews;
        totalSubs += daySubs;
        totalWatchMinutes += dayWatch;
        totalRev += dayRev;

        const snapshotId = `${user.uid}_${dateStr}`;
        const snapshot: AnalyticsSnapshot = {
          id: snapshotId,
          ownerId: user.uid,
          date: dateStr,
          views: dayViews,
          watchTime: Math.floor(dayWatch / 60) || 1, // Store as hours for simplicity
          revenue: dayRev,
          subscribers: daySubs
        };

        const snapRef = doc(db, 'analytics', snapshotId);
        batch.set(snapRef, snapshot);
      }

      // Update Channel overall statistics with generated aggregates
      const channelRef = doc(db, 'channels', user.uid);
      const totalWatchHours = Math.floor(totalWatchMinutes / 60);
      
      await updateDoc(channelRef, {
        views: totalViews,
        subscribers: channel.subscribers > 0 ? channel.subscribers : totalSubs,
        watchTime: totalWatchHours,
        revenue: parseFloat(totalRev.toFixed(2))
      });

      // Update local states for input forms
      setViews(totalViews);
      setWatchTime(totalWatchHours);
      setRevenue(parseFloat(totalRev.toFixed(2)));

      await batch.commit();
      setSaveSuccess(`Successfully generated 30 days of custom analytics snapshots!`);
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err) {
      console.error("Failed to generate custom analytics:", err);
      alert("Error generating analytics. Please check Firestore security rules.");
    } finally {
      setIsSaving(false);
    }
  };

  // Handler: Clear all Dummy videos, comments and analytics
  const handleClearDummyData = async () => {
    if (!window.confirm("Are you sure you want to delete all dummy/seeded videos, comments, and analytics snapshots from your channel? This will reset your metrics and give you a fresh, empty dashboard.")) {
      return;
    }

    setIsSaving(true);
    setSaveSuccess(null);

    try {
      const batch = writeBatch(db);

      // 1. Delete videos
      const qVideos = query(collection(db, 'videos'), where('ownerId', '==', user.uid));
      const snapVideos = await getDocs(qVideos);
      snapVideos.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // 2. Delete comments
      const qComments = query(collection(db, 'comments'), where('ownerId', '==', user.uid));
      const snapComments = await getDocs(qComments);
      snapComments.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // 3. Delete analytics
      const qAnalytics = query(collection(db, 'analytics'), where('ownerId', '==', user.uid));
      const snapAnalytics = await getDocs(qAnalytics);
      snapAnalytics.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // 4. Update channel info to minimal real starts
      const channelRef = doc(db, 'channels', user.uid);
      const clearedChannel: Partial<Channel> = {
        subscribers: 0,
        views: 0,
        watchTime: 0,
        revenue: 0.00,
        description: 'New, clean creator workspace. Welcome!'
      };

      await updateDoc(channelRef, clearedChannel);

      // Update forms
      setSubscribers(0);
      setViews(0);
      setWatchTime(0);
      setRevenue(0);
      setDescription('New, clean creator workspace. Welcome!');

      await batch.commit();
      setSaveSuccess("All dummy video, comment, and analytics data has been purged successfully!");
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err) {
      console.error("Failed to purge data:", err);
      alert("Error clearing data: " + err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handler: Re-seed full dummy template data for sandbox testing
  const handleReSeedTemplateData = async () => {
    if (!window.confirm("This will overwrite your channel statistics, videos, comments, and analytics back to the full-featured demo setup. Continue?")) {
      return;
    }

    setIsSaving(true);
    setSaveSuccess(null);

    try {
      await seedChannelData(user.uid, user.email || 'creator');
      
      // Update form fields
      setName(channel.name);
      setHandle(channel.handle);
      
      setSaveSuccess("Successfully restored beautiful demo video, comment, and analytics workspace data!");
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err) {
      console.error("Failed to re-seed template:", err);
      alert("Error seeding template data: " + err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6" id="channel-settings-container">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-sans text-white tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-red-500" />
            Channel Settings & Customizer
          </h1>
          <p className="text-xs text-gray-400 font-sans mt-1">
            Fully personalize your dashboard name, clear seed files, and adjust daily analytics metrics.
          </p>
        </div>
        <button
          onClick={() => onNavigate('dashboard')}
          className="px-4 py-2 bg-[#1e1e1e] hover:bg-[#282828] text-white border border-[#333] rounded-sm text-xs font-bold transition-all flex items-center gap-1.5 self-start sm:self-center"
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          Back to Dashboard
        </button>
      </div>

      {/* Operation Feedback banner */}
      {saveSuccess && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 rounded-sm flex items-center gap-2.5 text-xs font-medium">
          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 animate-bounce" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {isSaving && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-sm flex items-center gap-2.5 text-xs font-medium">
          <RefreshCw className="w-4 h-4 text-blue-400 flex-shrink-0 animate-spin" />
          <span>Processing cloud operation... please wait.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Settings Navigation Sidebar */}
        <div className="bg-[#1e1e1e] border border-[#333] rounded-md overflow-hidden flex flex-col h-fit">
          <button
            onClick={() => setActiveSubTab('profile')}
            className={`w-full text-left px-5 py-4 border-l-4 text-xs font-bold font-sans transition-all flex items-center justify-between ${
              activeSubTab === 'profile'
                ? 'bg-[#282828] border-red-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-[#1a1a1a]'
            }`}
          >
            <span className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Channel Profile Details
            </span>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </button>

          <button
            onClick={() => setActiveSubTab('analytics_gen')}
            className={`w-full text-left px-5 py-4 border-l-4 text-xs font-bold font-sans transition-all flex items-center justify-between ${
              activeSubTab === 'analytics_gen'
                ? 'bg-[#282828] border-red-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-[#1a1a1a]'
            }`}
          >
            <span className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4" />
              Custom Analytics Engine
            </span>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </button>

          <button
            onClick={() => setActiveSubTab('data_reset')}
            className={`w-full text-left px-5 py-4 border-l-4 text-xs font-bold font-sans transition-all flex items-center justify-between ${
              activeSubTab === 'data_reset'
                ? 'bg-[#282828] border-red-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-[#1a1a1a]'
            }`}
          >
            <span className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Data & Reset Options
            </span>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </button>
        </div>

        {/* Setting Panels */}
        <div className="lg:col-span-3 bg-[#1e1e1e] border border-[#333] rounded-md p-6">
          {activeSubTab === 'profile' && (
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div className="border-b border-[#333] pb-3">
                <h2 className="text-base font-bold text-white font-sans">Channel Identity & Public Profile</h2>
                <p className="text-[11px] text-gray-400 font-sans mt-0.5">Customize how your channel presents itself across the dashboard environment.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#aaa] uppercase tracking-wider font-sans">Channel Title Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full bg-[#0f0f0f] border border-[#333] focus:border-red-500 p-2.5 text-xs text-white rounded-sm outline-none font-sans"
                    placeholder="e.g. My Awesome Channel"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#aaa] uppercase tracking-wider font-sans">Custom Channel Handle</label>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    required
                    className="w-full bg-[#0f0f0f] border border-[#333] focus:border-red-500 p-2.5 text-xs text-white rounded-sm outline-none font-mono"
                    placeholder="e.g. @creativecreator"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#aaa] uppercase tracking-wider font-sans">Channel Avatar Image URL</label>
                  <input
                    type="text"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    required
                    className="w-full bg-[#0f0f0f] border border-[#333] focus:border-red-500 p-2.5 text-xs text-white rounded-sm outline-none font-sans"
                    placeholder="https://images.unsplash.com/..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#aaa] uppercase tracking-wider font-sans">Niche Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-[#0f0f0f] border border-[#333] focus:border-red-500 p-2.5 text-xs text-white rounded-sm outline-none font-sans"
                  >
                    <option value="Gaming">Gaming</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Technology">Technology</option>
                    <option value="Education">Education</option>
                    <option value="Music">Music</option>
                    <option value="Film & Animation">Film & Animation</option>
                    <option value="Science & Technology">Science & Technology</option>
                    <option value="Content Creator">Content Creator</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#aaa] uppercase tracking-wider font-sans">Channel Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-[#0f0f0f] border border-[#333] focus:border-red-500 p-2.5 text-xs text-white rounded-sm outline-none font-sans"
                  placeholder="Welcome to my official channel, subscribe for weekly posts!"
                />
              </div>

              <div className="border-b border-[#333] pt-4 pb-3">
                <h2 className="text-base font-bold text-white font-sans">Manual Override: Absolute Metrics</h2>
                <p className="text-[11px] text-gray-400 font-sans mt-0.5">Quickly edit your primary channel indicators showing in the top stats rail.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#aaa] uppercase tracking-wider font-sans">Subscribers</label>
                  <input
                    type="number"
                    value={subscribers}
                    onChange={(e) => setSubscribers(Number(e.target.value))}
                    className="w-full bg-[#0f0f0f] border border-[#333] focus:border-red-500 p-2.5 text-xs text-white rounded-sm outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#aaa] uppercase tracking-wider font-sans">Total Views</label>
                  <input
                    type="number"
                    value={views}
                    onChange={(e) => setViews(Number(e.target.value))}
                    className="w-full bg-[#0f0f0f] border border-[#333] focus:border-red-500 p-2.5 text-xs text-white rounded-sm outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#aaa] uppercase tracking-wider font-sans">Watch Time (Hrs)</label>
                  <input
                    type="number"
                    value={watchTime}
                    onChange={(e) => setWatchTime(Number(e.target.value))}
                    className="w-full bg-[#0f0f0f] border border-[#333] focus:border-red-500 p-2.5 text-xs text-white rounded-sm outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#aaa] uppercase tracking-wider font-sans">Est. Earnings ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={revenue}
                    onChange={(e) => setRevenue(Number(e.target.value))}
                    className="w-full bg-[#0f0f0f] border border-[#333] focus:border-red-500 p-2.5 text-xs text-white rounded-sm outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-[#333]">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-900 text-white text-xs font-bold rounded-sm transition-all cursor-pointer"
                >
                  Save Profile Changes
                </button>
              </div>
            </form>
          )}

          {activeSubTab === 'analytics_gen' && (
            <div className="space-y-6">
              <div className="border-b border-[#333] pb-3">
                <h2 className="text-base font-bold text-white font-sans">Custom Daily Analytics Snapshot Engine</h2>
                <p className="text-[11px] text-gray-400 font-sans mt-0.5">Define your daily channel averages and let our engine render a realistic, natural 30-day timeline trajectory for the area graphs!</p>
              </div>

              <div className="p-4 bg-[#282828] border border-[#333] rounded-sm flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-white">How this fixes your analytics</h4>
                  <p className="text-[11px] text-gray-300 leading-relaxed font-sans">
                    By entering your actual daily metrics below, the system will delete the template gaming metrics and simulate 30 distinct daily nodes that match your channel's real rate. This updates both the Dashboard cards and the deep Analytics Area Graphs!
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#aaa] uppercase tracking-wider font-sans">Avg. Daily Views</label>
                  <input
                    type="number"
                    value={avgDailyViews}
                    onChange={(e) => setAvgDailyViews(Number(e.target.value))}
                    className="w-full bg-[#0f0f0f] border border-[#333] focus:border-red-500 p-2.5 text-xs text-white rounded-sm outline-none font-mono"
                  />
                  <span className="text-[10px] text-gray-400">Yields approx. {(avgDailyViews * 30).toLocaleString()} views over 30 days.</span>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#aaa] uppercase tracking-wider font-sans">Avg. Daily Subscribers Gained</label>
                  <input
                    type="number"
                    value={avgDailySubs}
                    onChange={(e) => setAvgDailySubs(Number(e.target.value))}
                    className="w-full bg-[#0f0f0f] border border-[#333] focus:border-red-500 p-2.5 text-xs text-white rounded-sm outline-none font-mono"
                  />
                  <span className="text-[10px] text-gray-400">Yields approx. {(avgDailySubs * 30).toLocaleString()} net new subs.</span>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#aaa] uppercase tracking-wider font-sans">Avg. Daily Watch Time (Minutes)</label>
                  <input
                    type="number"
                    value={avgDailyWatch}
                    onChange={(e) => setAvgDailyWatch(Number(e.target.value))}
                    className="w-full bg-[#0f0f0f] border border-[#333] focus:border-red-500 p-2.5 text-xs text-white rounded-sm outline-none font-mono"
                  />
                  <span className="text-[10px] text-gray-400">Yields approx. {Math.floor((avgDailyWatch * 30) / 60).toLocaleString()} watch hours.</span>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#aaa] uppercase tracking-wider font-sans">Avg. Daily Earnings ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={avgDailyRev}
                    onChange={(e) => setAvgDailyRev(Number(e.target.value))}
                    className="w-full bg-[#0f0f0f] border border-[#333] focus:border-red-500 p-2.5 text-xs text-white rounded-sm outline-none font-mono"
                  />
                  <span className="text-[10px] text-gray-400">Yields approx. ${(avgDailyRev * 30).toFixed(2)} in monthly earnings.</span>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-[#333]">
                <button
                  type="button"
                  onClick={handleGenerateAnalytics}
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-900 text-white text-xs font-bold rounded-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Generate 30-Day Trajectory
                </button>
              </div>
            </div>
          )}

          {activeSubTab === 'data_reset' && (
            <div className="space-y-6">
              <div className="border-b border-[#333] pb-3">
                <h2 className="text-base font-bold text-white font-sans">Channel Data Reset & Purge Panel</h2>
                <p className="text-[11px] text-gray-400 font-sans mt-0.5">Permanently clear simulated data records or restore full-featured mock templates for debugging.</p>
              </div>

              {/* Danger Zone: Clear Dummy/Seed Data */}
              <div className="border border-red-500/20 bg-red-500/5 rounded-md p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <Trash2 className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-white">Purge All Dummy Videos & Seed Metrics</h3>
                    <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                      This action will delete all pre-seeded RPG/Elden Ring videos, related subscriber metrics, and comments from Firestore. Your channel stats (Subscribers, Views, Watch Time, Revenue) will be set to 0. Use this to prepare your workspace for purely custom data!
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleClearDummyData}
                    disabled={isSaving}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-900 text-white text-xs font-bold rounded-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Purge Dummy Data Completely
                  </button>
                </div>
              </div>

              {/* Restore Seed Template Data */}
              <div className="border border-indigo-500/20 bg-indigo-500/5 rounded-md p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-white">Restore Beautiful Gaming Dummy Data</h3>
                    <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                      If you've purged your workspace but want to load the fully populated Gaming channel and 5 sample RPG videos with 24 comments and 30 days of analytics for simulation or presentation, click below.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleReSeedTemplateData}
                    disabled={isSaving}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 text-white text-xs font-bold rounded-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Restore Demo Template Data
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
