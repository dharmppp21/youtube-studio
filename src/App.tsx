import { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, 
  signInAnonymously 
} from 'firebase/auth';
import { 
  collection, query, where, onSnapshot, doc, setDoc,
  deleteDoc, updateDoc, getDoc
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, testConnection } from './firebase';
import { seedChannelData } from './seedData';
import { syncAllYouTubeData } from './youtubeApi';
import { Channel, Video, Comment, AnalyticsSnapshot } from './types';
import DashboardView from './components/DashboardView';
import AnalyticsView from './components/AnalyticsView';
import VideoManagerView from './components/VideoManagerView';
import CommentModeratorView from './components/CommentModeratorView';
import AIStudioAssistantView from './components/AIStudioAssistantView';
import ChannelSettingsView from './components/ChannelSettingsView';

import { 
  LayoutDashboard, Video as VideoIcon, BarChart2, MessageSquare, 
  Sparkles, LogOut, Loader2, Play, RefreshCw, KeyRound, Globe, Menu, Settings
} from 'lucide-react';

export default function App() {
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSandboxMode, setIsSandboxMode] = useState(false);

  // YouTube live sync states
  const [isSyncingYT, setIsSyncingYT] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => {
    return sessionStorage.getItem('yt_google_access_token');
  });

  // Layout navigation state
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Firestore synchronization states
  const [channel, setChannel] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // Handle Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      // Test Firebase connection when auth state changes
      if (currentUser) {
        try {
          await testConnection();
        } catch (error) {
          console.warn('Firebase connection test failed:', error);
          // Continue anyway - the app might still work with cached data
        }

        setDbLoading(true);
        const channelRef = doc(db, 'channels', currentUser.uid);

        try {
          const channelSnap = await getDoc(channelRef);

          if (!channelSnap.exists()) {
            const isGoogleUser = currentUser.providerData.some(
              (p: any) => p?.providerId === 'google.com'
            );
            const isSandbox = currentUser.isAnonymous === true;

            if (isSandbox) {
              // Sandbox path: seed the full demo so the workspace starts populated.
              setIsSeeding(true);
              await seedChannelData(currentUser.uid, currentUser.email || 'creator');
              setIsSeeding(false);
            } else if (isGoogleUser) {
              // Real Google user: write a minimal placeholder so the dashboard
              // can render with the user's real identity. Live YouTube data will
              // overwrite this once the user connects their channel.
              const googleProfile = currentUser.providerData.find(
                (p: any) => p?.providerId === 'google.com'
              );
              const realName =
                currentUser.displayName ||
                googleProfile?.displayName ||
                (currentUser.email ? currentUser.email.split('@')[0] : 'Creator');
              const realPhoto =
                currentUser.photoURL ||
                googleProfile?.photoURL ||
                `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.uid}`;
              const realHandle = currentUser.email
                ? '@' + currentUser.email.split('@')[0].toLowerCase()
                : '@' + currentUser.uid.slice(0, 8);

              const placeholderChannel: Channel = {
                id: currentUser.uid,
                name: realName,
                handle: realHandle,
                avatarUrl: realPhoto,
                subscribers: 0,
                views: 0,
                watchTime: 0,
                revenue: 0,
                description: 'Your YouTube Creator Studio is ready. Connect your channel to load live stats.',
                category: 'Content Creator',
                createdAt: new Date().toISOString()
              };

              await setDoc(channelRef, placeholderChannel);

              // Returning visitor with a cached token: silently re-sync so the
              // workspace doesn't sit empty after refresh.
              const cachedToken = sessionStorage.getItem('yt_google_access_token');
              if (cachedToken) {
                try {
                  setIsSyncingYT(true);
                  setSyncStatusMsg('Restoring your YouTube channel data...');
                  await syncAllYouTubeData(cachedToken, currentUser.uid);
                  setSyncStatusMsg(null);
                } catch (e) {
                  console.warn('Auto-sync on return failed:', e);
                  setSyncStatusMsg('Could not refresh YouTube data. Click "Retry Sync".');
                } finally {
                  setIsSyncingYT(false);
                }
              }
            }
            // If neither (e.g. providerData still resolving), do nothing destructive.
          }
        } catch (error) {
          console.error("Error reading/seeding channel:", error);
        } finally {
          setDbLoading(false);
        }
      } else {
        // Clear states when logged out
        setChannel(null);
        setVideos([]);
        setComments([]);
        setAnalytics([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Real-time Firestore Sync Listeners
  useEffect(() => {
    if (!user) return;

    setDbLoading(true);

    // 1. Channel profile listener
    const unsubscribeChannel = onSnapshot(
      doc(db, 'channels', user.uid),
      (snapshot) => {
        if (snapshot.exists()) {
          setChannel(snapshot.data() as Channel);
        }
        setDbLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.GET, `channels/${user.uid}`)
    );

    // 2. Videos listener
    const qVideos = query(collection(db, 'videos'), where('ownerId', '==', user.uid));
    const unsubscribeVideos = onSnapshot(
      qVideos,
      (snapshot) => {
        const vList: Video[] = [];
        snapshot.forEach((doc) => {
          vList.push(doc.data() as Video);
        });
        setVideos(vList);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'videos')
    );

    // 3. Comments listener
    const qComments = query(collection(db, 'comments'), where('ownerId', '==', user.uid));
    const unsubscribeComments = onSnapshot(
      qComments,
      (snapshot) => {
        const cList: Comment[] = [];
        snapshot.forEach((doc) => {
          cList.push(doc.data() as Comment);
        });
        setComments(cList);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'comments')
    );

    // 4. Analytics Snapshot listener
    const qAnalytics = query(collection(db, 'analytics'), where('ownerId', '==', user.uid));
    const unsubscribeAnalytics = onSnapshot(
      qAnalytics,
      (snapshot) => {
        const aList: AnalyticsSnapshot[] = [];
        snapshot.forEach((doc) => {
          aList.push(doc.data() as AnalyticsSnapshot);
        });
        setAnalytics(aList);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'analytics')
    );

    return () => {
      unsubscribeChannel();
      unsubscribeVideos();
      unsubscribeComments();
      unsubscribeAnalytics();
    };
  }, [user]);

  // Auth Operations
  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    // Request read-only YouTube and YouTube Analytics scopes
    provider.addScope('https://www.googleapis.com/auth/youtube.readonly');
    provider.addScope('https://www.googleapis.com/auth/yt-analytics.readonly');
    provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
    provider.addScope('https://www.googleapis.com/auth/userinfo.email');

    try {
      setIsSyncingYT(true);
      setSyncStatusMsg("Initiating secure YouTube channel link...");
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (token) {
        setGoogleAccessToken(token);
        sessionStorage.setItem('yt_google_access_token', token);
        
        setSyncStatusMsg("Retrieving uploads, live comments & analytics metrics...");
        const syncResult = await syncAllYouTubeData(token, result.user.uid);
        
        if (syncResult.success) {
          setSyncStatusMsg(`Successfully linked with channel "${syncResult.channelName}"!`);
          setTimeout(() => setSyncStatusMsg(null), 4000);
        }
      } else {
        setSyncStatusMsg(null);
      }
    } catch (error: any) {
      console.error("Google Popup Auth failed:", error);
      setSyncStatusMsg(null);
      alert(error.message || "Real Google Login was blocked. Please verify popups are allowed or use the offline 'Creator Sandbox' below!");
    } finally {
      setIsSyncingYT(false);
    }
  };

  const handleSandboxSignIn = async () => {
    setIsSandboxMode(true);
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error("Sandbox Sign-In failed:", error);
      alert("Sandbox login failed. Please retry.");
    }
  };

  // Re-run live sync using the cached Google access token. No popup, no re-auth.
  // Token may have expired (Google OAuth tokens last ~1h) — if so, we surface
  // a clear message so the user knows to click "Connect Channel" again.
  const handleRetrySync = async () => {
    if (!user) return;
    const token = googleAccessToken || sessionStorage.getItem('yt_google_access_token');
    if (!token) {
      alert('No cached Google session. Click "Connect Channel" to re-authorize.');
      return;
    }

    setIsSyncingYT(true);
    setSyncStatusMsg('Retrying YouTube channel sync...');
    try {
      const result = await syncAllYouTubeData(token, user.uid);
      setSyncStatusMsg(`Synced live data for "${result.channelName}"!`);
      setTimeout(() => setSyncStatusMsg(null), 4000);
    } catch (err: any) {
      console.error('Retry sync failed:', err);
      const msg = String(err?.message || err || '');
      if (/401|invalid_token|expired/i.test(msg)) {
        setSyncStatusMsg('Google session expired. Click "Connect Channel" to re-authorize.');
        // Drop the dead token so we don't keep failing.
        setGoogleAccessToken(null);
        sessionStorage.removeItem('yt_google_access_token');
      } else {
        setSyncStatusMsg(`Sync failed: ${msg || 'unknown error'}. Try again.`);
      }
    } finally {
      setIsSyncingYT(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setIsSandboxMode(false);
    setGoogleAccessToken(null);
    sessionStorage.removeItem('yt_google_access_token');
  };

  // Video Management Mutations
  const handleUploadVideo = async (newVideoData: any) => {
    if (!user) return;
    const videoId = 'video_' + Math.random().toString(36).substring(2, 9);
    const videoDoc: Video = {
      ...newVideoData,
      id: videoId,
      ownerId: user.uid,
      views: 0,
      likes: 0,
      commentsCount: 0,
      watchTime: 0,
      revenue: 0,
      status: 'ready',
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'videos', videoId), videoDoc);

      // Increment video count locally if needed or add dummy analytics view logs
      if (channel) {
        await updateDoc(doc(db, 'channels', user.uid), {
          views: channel.views + 1
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `videos/${videoId}`);
    }
  };

  const handleUpdateVideo = async (updatedVideo: Video) => {
    try {
      await setDoc(doc(db, 'videos', updatedVideo.id), updatedVideo);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `videos/${updatedVideo.id}`);
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    try {
      await deleteDoc(doc(db, 'videos', videoId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `videos/${videoId}`);
    }
  };

  // Comments Moderation Mutations
  const handleReplyToComment = async (commentId: string, replyText: string) => {
    try {
      await updateDoc(doc(db, 'comments', commentId), {
        reply: replyText,
        repliedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `comments/${commentId}`);
    }
  };

  const handleToggleHeart = async (commentId: string, currentHeart: boolean) => {
    try {
      await updateDoc(doc(db, 'comments', commentId), {
        hasHeart: !currentHeart
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `comments/${commentId}`);
    }
  };

  const handleTogglePin = async (commentId: string, currentPin: boolean) => {
    try {
      // Unpin all other comments on the same video first for UI consistency
      const commentToUpdate = comments.find(c => c.id === commentId);
      if (commentToUpdate && !currentPin) {
        const pinnedOnVideo = comments.filter(c => c.videoId === commentToUpdate.videoId && c.isPinned);
        for (const p of pinnedOnVideo) {
          await updateDoc(doc(db, 'comments', p.id), { isPinned: false });
        }
      }

      await updateDoc(doc(db, 'comments', commentId), {
        isPinned: !currentPin
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `comments/${commentId}`);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteDoc(doc(db, 'comments', commentId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `comments/${commentId}`);
    }
  };

  // Add draft video from AI generator
  const handleAddDraftVideo = async (draft: { title: string; description: string; category: string; tags: string[] }) => {
    if (!user) return;
    const videoId = 'video_' + Math.random().toString(36).substring(2, 9);
    const videoDoc: Video = {
      id: videoId,
      ownerId: user.uid,
      title: draft.title,
      description: draft.description,
      thumbnailUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80',
      visibility: 'private',
      category: draft.category,
      tags: draft.tags,
      views: 0,
      likes: 0,
      commentsCount: 0,
      duration: '10:00',
      watchTime: 0,
      revenue: 0,
      status: 'ready',
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'videos', videoId), videoDoc);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `videos/${videoId}`);
    }
  };

  // Loading Screens
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f0f0f] text-white">
        <Loader2 className="w-10 h-10 text-red-600 animate-spin mb-4" />
        <p className="text-sm text-gray-400 font-sans">Connecting to YouTube Cloud Engine...</p>
      </div>
    );
  }

  if (isSeeding) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f0f0f] text-white p-8 text-center max-w-md mx-auto">
        <Loader2 className="w-10 h-10 text-red-600 animate-spin mb-4" />
        <h3 className="text-lg font-bold font-sans">Seeding Creator Studio Dashboard...</h3>
        <p className="text-xs text-gray-400 font-sans mt-2 leading-relaxed">
          Generating 30 days of synthetic search metrics, subscriber trends, sample videos, and fan engagement comments. Your professional workspace will load in a few seconds!
        </p>
      </div>
    );
  }

  // Login page layout
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#1e1e1e] border border-[#333] rounded-md p-8 space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            {/* Red Play Logo */}
            <div className="inline-flex p-3 bg-red-600 border border-[#333] rounded-sm mb-2">
              <Play className="w-6 h-6 text-white fill-current" />
            </div>
            <h1 className="text-xl font-bold font-sans text-white tracking-tight">YouTube Studio</h1>
            <p className="text-xs text-[#aaa] font-sans max-w-xs mx-auto">
              Analyze metrics, engage with viewers, and utilize Gemini-powered copywriting to scale your channel.
            </p>
          </div>

          <div className="space-y-3">
            {/* Real Google Auth */}
            <button
              onClick={handleGoogleSignIn}
              className="w-full py-2.5 px-4 bg-white hover:bg-zinc-100 text-zinc-900 font-bold rounded-sm text-xs transition-colors font-sans flex items-center justify-center gap-2 border border-zinc-200 cursor-pointer"
            >
              <Globe className="w-4 h-4 text-blue-500" />
              Sign in with Google
            </button>

            {/* Sandbox developer authorization */}
            <button
              onClick={handleSandboxSignIn}
              className="w-full py-2.5 px-4 bg-[#282828] hover:bg-[#1e1e1e] text-gray-300 hover:text-white font-bold rounded-sm text-xs transition-all font-sans flex items-center justify-center gap-2 border border-[#333] cursor-pointer"
            >
              <KeyRound className="w-4 h-4 text-red-500" />
              Enter Creator Sandbox (Zero Config)
            </button>
          </div>

          <div className="p-4 bg-[#0f0f0f] border border-[#333] rounded-sm">
            <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-red-500 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> AI Studio Features
            </span>
            <p className="text-[10px] text-gray-300 leading-relaxed font-sans mt-1.5">
              Powered by server-side Gemini 2.5 models. Easily optimize metadata CTR, brainstorm viral concepts, and write fully detailed video script chapters.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white flex flex-col select-none font-sans" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      {/* Top Navigation Bar */}
      <header className="bg-[#0f0f0f] border-b border-[#333] h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className="p-1.5 hover:bg-[#1e1e1e] rounded-sm text-[#aaa] hover:text-white transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="w-8 h-8 bg-red-600 rounded-sm flex items-center justify-center">
              <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-white border-b-[6px] border-b-transparent ml-1"></div>
            </div>
            <span className="font-bold text-xl tracking-tight hidden sm:inline">Studio</span>
          </div>
        </div>

        {/* User profile avatar info */}
        <div className="flex items-center gap-3">
          {channel && (
            <div className="flex items-center gap-2 border-r border-[#333] pr-4 hidden sm:flex">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex-shrink-0 border border-[#333]">
                <img 
                  src={channel.avatarUrl} 
                  alt={channel.name} 
                  className="w-full h-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold font-sans text-gray-200">{channel.name}</p>
                <p className="text-[9px] font-mono text-[#aaa]">{channel.handle}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleSignOut}
            className="p-2 hover:bg-[#1e1e1e] rounded-sm text-[#aaa] hover:text-red-400 transition-colors flex items-center gap-1 text-xs font-semibold font-sans cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Panel Content with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <aside 
          className={`bg-[#0f0f0f] border-r border-[#333] transition-all duration-300 flex-shrink-0 flex flex-col justify-between ${
            isSidebarOpen ? 'w-64' : 'w-16'
          } hidden md:flex`}
        >
          <div className="flex flex-col gap-1 py-4">
            {channel && isSidebarOpen && (
              <div className="px-6 mb-4">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 mx-auto border-4 border-[#282828] shadow-xl overflow-hidden">
                  <img src={channel.avatarUrl} alt={channel.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <p className="text-center mt-3 font-medium text-sm text-white">{channel.name}</p>
                <p className="text-center text-xs text-[#aaa]">Creator Lab Pro</p>
              </div>
            )}

            <nav className="flex flex-col">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                { id: 'content', label: 'Content', icon: VideoIcon },
                { id: 'analytics', label: 'Analytics', icon: BarChart2 },
                { id: 'comments', label: 'Comments', icon: MessageSquare },
                { id: 'assistant', label: 'AI Suite', icon: Sparkles },
                { id: 'settings', label: 'Channel Settings', icon: Settings },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-4 px-6 py-3 text-sm font-medium transition-all cursor-pointer border-l-4 ${
                      isActive
                        ? 'bg-[#282828] border-red-500 text-white font-bold'
                        : 'text-[#aaa] hover:bg-[#1e1e1e] border-transparent'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className={`${isSidebarOpen ? 'inline' : 'hidden'} transition-all`}>
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Quick status card */}
          {isSidebarOpen && channel && (
            <div className="p-4 m-4 bg-[#1e1e1e] border border-[#333] rounded-sm space-y-1">
              <p className="text-[10px] font-bold font-sans text-[#aaa] uppercase tracking-wider">Channel Status</p>
              <div className="flex items-center justify-between text-xs font-mono font-bold text-white mt-1.5">
                <span>Subs:</span>
                <span className="text-[#3ea6ff]">{channel.subscribers.toLocaleString()}</span>
              </div>
            </div>
          )}
        </aside>

        {/* Mobile Nav Drawer */}
        <div className="md:hidden flex bg-[#0f0f0f] border-b border-[#333] py-2 px-4 justify-around">
          {[
            { id: 'dashboard', icon: LayoutDashboard },
            { id: 'content', icon: VideoIcon },
            { id: 'analytics', icon: BarChart2 },
            { id: 'comments', icon: MessageSquare },
            { id: 'assistant', icon: Sparkles },
            { id: 'settings', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`p-2.5 transition-all cursor-pointer ${
                  isActive 
                    ? 'text-red-500 bg-[#282828] rounded-sm border-b-2 border-red-500' 
                    : 'text-[#aaa] hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
              </button>
            );
          })}
        </div>

        {/* Scrollable Main Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {dbLoading && (
            <div className="p-3 bg-[#1e1e1e] border border-[#333] rounded-sm flex items-center justify-between gap-3 text-xs text-gray-400">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#3ea6ff]" />
                <span>Syncing cloud databases in real time...</span>
              </div>
            </div>
          )}

          {/* Tab Views */}
          {activeTab === 'dashboard' && (
            <DashboardView
              channel={channel}
              videos={videos}
              comments={comments}
              onNavigate={setActiveTab}
              onOpenUploadModal={() => setActiveTab('content')}
              googleAccessToken={googleAccessToken}
              isSyncingYT={isSyncingYT}
              syncStatusMsg={syncStatusMsg}
              onConnectYouTube={handleGoogleSignIn}
              onRetrySync={handleRetrySync}
              isSandbox={isSandboxMode}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView 
              analytics={analytics} 
              videos={videos} 
            />
          )}

          {activeTab === 'content' && (
            <VideoManagerView 
              videos={videos} 
              onUploadVideo={handleUploadVideo} 
              onUpdateVideo={handleUpdateVideo} 
              onDeleteVideo={handleDeleteVideo} 
            />
          )}

          {activeTab === 'comments' && (
            <CommentModeratorView 
              comments={comments} 
              onReplyToComment={handleReplyToComment} 
              onToggleHeart={handleToggleHeart} 
              onTogglePin={handleTogglePin} 
              onDeleteComment={handleDeleteComment} 
            />
          )}

          {activeTab === 'assistant' && (
            <AIStudioAssistantView 
              onAddDraftVideo={handleAddDraftVideo} 
            />
          )}

          {activeTab === 'settings' && channel && (
            <ChannelSettingsView
              channel={channel}
              user={user}
              videos={videos}
              analytics={analytics}
              onNavigate={setActiveTab}
            />
          )}
        </main>
      </div>
    </div>
  );
}
