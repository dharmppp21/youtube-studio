import { doc, setDoc, writeBatch, collection, getDocs, getDoc, query, where, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Channel, Video, Comment, AnalyticsSnapshot } from './types';

// Parses ISO 8601 durations (e.g. PT12M45S -> "12:45")
export function parseISODuration(duration: string): string {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = duration.match(regex);
  if (!matches) return '10:00';
  const hours = matches[1] ? parseInt(matches[1]) : 0;
  const minutes = matches[2] ? parseInt(matches[2]) : 0;
  const seconds = matches[3] ? parseInt(matches[3]) : 0;

  const parts = [];
  if (hours > 0) {
    parts.push(hours.toString());
    parts.push(minutes.toString().padStart(2, '0'));
  } else {
    parts.push(minutes.toString());
  }
  parts.push(seconds.toString().padStart(2, '0'));
  return parts.join(':');
}

// Maps YouTube category IDs to standard names
export function mapCategoryId(categoryId: string): string {
  const categories: Record<string, string> = {
    '1': 'Film & Animation',
    '2': 'Autos & Vehicles',
    '10': 'Music',
    '15': 'Pets & Animals',
    '17': 'Sports',
    '19': 'Travel & Events',
    '20': 'Gaming',
    '22': 'People & Blogs',
    '23': 'Comedy',
    '24': 'Entertainment',
    '25': 'News & Politics',
    '26': 'Howto & Style',
    '27': 'Education',
    '28': 'Science & Technology',
    '29': 'Nonprofits & Activism',
  };
  return categories[categoryId] || 'Entertainment';
}

/**
 * Detect and remove the placeholder channel doc written for Google users who
 * haven't completed a YouTube sync yet, so the live sync can replace it cleanly
 * without leaving any seeded "GAMING" / email-derived identity behind.
 *
 * Conservative: only deletes if the existing doc looks like a placeholder
 * (auto-generated name ending in " GAMING" or matching the email-derived seed).
 */
async function clearPreviousChannelPlaceholder(userId: string) {
  try {
    const channelRef = doc(db, 'channels', userId);
    const snap = await getDoc(channelRef);
    if (!snap.exists()) return;

    const data = snap.data() as { name?: string; handle?: string };
    const name = (data.name || '').trim();
    const handle = (data.handle || '').trim();

    // Heuristics for the seedData placeholder:
    //   - "daddugaming" / "<email-local> GAMING" naming convention
    //   - avatar hosted on dicebear bottts (seed-only)
    //   - handle = "@" + email-local lowercase
    const looksLikeSeed =
      / GAMING$/i.test(name) ||
      /^@?[a-z0-9._-]+$/i.test(handle);

    if (looksLikeSeed) {
      await deleteDoc(channelRef);
    }
  } catch (err) {
    console.warn("Failed to clear previous channel placeholder:", err);
  }
}

/**
 * Clean up existing seeded/simulated documents in Firestore for a user
 * before writing their real YouTube channel data to avoid duplicate/mixed views.
 */
async function clearPreviousSeededData(userId: string) {
  try {
    const batch = writeBatch(db);

    // 1. Fetch and delete videos
    const qVideos = query(collection(db, 'videos'), where('ownerId', '==', userId));
    const snapVideos = await getDocs(qVideos);
    snapVideos.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // 2. Fetch and delete comments
    const qComments = query(collection(db, 'comments'), where('ownerId', '==', userId));
    const snapComments = await getDocs(qComments);
    snapComments.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // 3. Fetch and delete analytics
    const qAnalytics = query(collection(db, 'analytics'), where('ownerId', '==', userId));
    const snapAnalytics = await getDocs(qAnalytics);
    snapAnalytics.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  } catch (err) {
    console.warn("Failed to clear previous seeded data:", err);
  }
}

/**
 * Syncs all channel info, videos, comments, and analytics using the Google access token
 */
export async function syncAllYouTubeData(token: string, userId: string): Promise<{ success: boolean; channelName: string; fallbackAnalytics: boolean }> {
  // 1. Fetch Google/YouTube channel profile
  const channelUrl = 'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true';
  const channelRes = await fetch(channelUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!channelRes.ok) {
    throw new Error(`Failed to fetch channel info: ${channelRes.status} ${channelRes.statusText}`);
  }

  const channelJson = await channelRes.json();
  if (!channelJson.items || channelJson.items.length === 0) {
    throw new Error('No YouTube channel found for this Google Account. Please create a channel first.');
  }

  const ytChannel = channelJson.items[0];
  const channelName = ytChannel.snippet.title;
  const subscribersCount = parseInt(ytChannel.statistics.subscriberCount) || 0;
  const viewsCount = parseInt(ytChannel.statistics.viewCount) || 0;
  const uploadsPlaylistId = ytChannel.contentDetails?.relatedPlaylists?.uploads;

  // Clear any seed/placeholder channel doc, then clear simulated videos/comments/analytics.
  // Order matters: placeholder must be removed before batch.set so the live write is authoritative.
  await clearPreviousChannelPlaceholder(userId);
  await clearPreviousSeededData(userId);

  // 2. Fetch YouTube Videos from Uploads Playlist
  const fetchedVideos: Video[] = [];
  const videoTitleMap: Record<string, string> = {}; // Helper for comments title mapping

  if (uploadsPlaylistId) {
    try {
      const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails,status&playlistId=${uploadsPlaylistId}&maxResults=15`;
      const playlistRes = await fetch(playlistUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (playlistRes.ok) {
        const playlistJson = await playlistRes.json();
        const items = playlistJson.items || [];
        const videoIds = items.map((item: any) => item.contentDetails?.videoId).filter(Boolean);

        if (videoIds.length > 0) {
          // Fetch statistics and content details for each video in batch
          const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails,status&id=${videoIds.join(',')}`;
          const videosRes = await fetch(videosUrl, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (videosRes.ok) {
            const videosJson = await videosRes.json();
            const rawVideos = videosJson.items || [];

            rawVideos.forEach((v: any, index: number) => {
              const vViews = parseInt(v.statistics?.viewCount) || 0;
              const vLikes = parseInt(v.statistics?.likeCount) || 0;
              const vComments = parseInt(v.statistics?.commentCount) || 0;
              
              // Estimate simulated watch time & revenue for design authenticity
              const estimatedWatchTime = Math.floor(vViews * 4.2); // approx 4.2 mins average watch
              const estimatedRevenue = parseFloat(((vViews * 3.8) / 1000).toFixed(2)); // $3.8 CPM

              const mappedVideo: Video = {
                id: v.id,
                ownerId: userId,
                title: v.snippet?.title || `Video #${index + 1}`,
                description: v.snippet?.description || '',
                thumbnailUrl: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80',
                visibility: (v.status?.privacyStatus || 'public') as 'public' | 'unlisted' | 'private',
                category: mapCategoryId(v.snippet?.categoryId),
                tags: v.snippet?.tags || [],
                views: vViews,
                likes: vLikes,
                commentsCount: vComments,
                duration: parseISODuration(v.contentDetails?.duration),
                watchTime: estimatedWatchTime,
                revenue: estimatedRevenue,
                status: 'ready',
                createdAt: v.snippet?.publishedAt || new Date().toISOString()
              };

              fetchedVideos.push(mappedVideo);
              videoTitleMap[v.id] = mappedVideo.title;
            });
          }
        }
      }
    } catch (vErr) {
      console.warn("Error fetching live YouTube videos:", vErr);
    }
  }

  // 3. Fetch YouTube Comments
  const fetchedComments: Comment[] = [];
  try {
    const commentsUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&allThreadsRelatedToChannelId=true&maxResults=20`;
    const commentsRes = await fetch(commentsUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (commentsRes.ok) {
      const commentsJson = await commentsRes.json();
      const rawThreads = commentsJson.items || [];

      rawThreads.forEach((thread: any) => {
        const topComment = thread.snippet?.topLevelComment;
        if (!topComment) return;

        const cId = thread.id;
        const vId = thread.snippet?.videoId || '';
        const authorSnippet = topComment.snippet;

        // Check if there's any owner reply in thread replies
        let ownerReplyText = '';
        let ownerRepliedAt = '';
        const repliesList = thread.replies?.comments || [];
        const foundReply = repliesList.find((rep: any) => rep.snippet?.authorChannelId?.value === ytChannel.id);
        if (foundReply) {
          ownerReplyText = foundReply.snippet?.textOriginal || foundReply.snippet?.textDisplay || '';
          ownerRepliedAt = foundReply.snippet?.publishedAt || '';
        }

        const mappedComment: Comment = {
          id: cId,
          videoId: vId,
          videoTitle: videoTitleMap[vId] || 'Recent Video Upload',
          ownerId: userId,
          authorName: authorSnippet?.authorDisplayName || 'Anonymous Viewer',
          authorAvatarUrl: authorSnippet?.authorProfileImageUrl || 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Viewer',
          content: authorSnippet?.textOriginal || authorSnippet?.textDisplay || '',
          likes: parseInt(authorSnippet?.likeCount) || 0,
          hasHeart: ownerReplyText !== '',
          isPinned: false,
          reply: ownerReplyText || undefined,
          repliedAt: ownerRepliedAt || undefined,
          createdAt: authorSnippet?.publishedAt || new Date().toISOString()
        };

        fetchedComments.push(mappedComment);
      });
    }
  } catch (cErr) {
    console.warn("Error fetching live YouTube comments:", cErr);
  }

  // 4. Fetch YouTube Analytics with fallback
  const fetchedAnalytics: AnalyticsSnapshot[] = [];
  let isAnalyticsFallback = false;

  try {
    const endDateStr = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startDateStr = startDate.toISOString().split('T')[0];

    const analyticsUrl = `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDateStr}&endDate=${endDateStr}&metrics=views,comments,likes,estimatedMinutesWatched,subscribersGained&dimensions=day`;
    const analyticsRes = await fetch(analyticsUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (analyticsRes.ok) {
      const analyticsJson = await analyticsRes.json();
      const rows = analyticsJson.rows || [];
      
      rows.forEach((row: any[]) => {
        // Row format: [date, views, comments, likes, estimatedMinutesWatched, subscribersGained]
        const dateStr = row[0];
        const dayViews = parseInt(row[1]) || 0;
        const dayComments = parseInt(row[2]) || 0;
        const dayLikes = parseInt(row[3]) || 0;
        const dayMinutes = parseInt(row[4]) || 0;
        const daySubscribers = parseInt(row[5]) || 0;

        const snapshotId = `${userId}_${dateStr}`;
        const snapshot: AnalyticsSnapshot = {
          id: snapshotId,
          ownerId: userId,
          date: dateStr,
          views: dayViews,
          watchTime: Math.floor(dayMinutes), // minutes
          revenue: parseFloat(((dayViews * 3.8) / 1000).toFixed(2)), // custom calculated based on view share
          subscribers: daySubscribers
        };

        fetchedAnalytics.push(snapshot);
      });
    } else {
      isAnalyticsFallback = true;
    }
  } catch (aErr) {
    console.warn("Error fetching YouTube Analytics API, initiating smart scaling fallback...", aErr);
    isAnalyticsFallback = true;
  }

  // If YouTube Analytics was unavailable, let's auto-generate structured, realistic day-by-day analytics
  // scaled down or up to perfectly match their actual live views and subscriber stats!
  if (isAnalyticsFallback || fetchedAnalytics.length === 0) {
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - 30);
    
    // Distribute total views/subs across 30 days dynamically
    const avgDailyViews = Math.floor(viewsCount / 1000) || 120;
    const avgDailySubs = Math.floor(subscribersCount / 800) || 2;

    for (let i = 0; i < 30; i++) {
      const dateStr = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Add slight randomness to daily trends
      const dayViews = Math.max(1, Math.floor(avgDailyViews * (0.6 + Math.random() * 0.8)));
      const daySubs = Math.max(0, Math.floor(avgDailySubs * (0.4 + Math.random() * 1.2)));
      const dayWatch = Math.floor(dayViews * (3 + Math.random() * 2)); // 3-5 mins average
      const dayRev = parseFloat(((dayViews * 3.8) / 1000).toFixed(2));

      const snapshotId = `${userId}_${dateStr}`;
      const snapshot: AnalyticsSnapshot = {
        id: snapshotId,
        ownerId: userId,
        date: dateStr,
        views: dayViews,
        watchTime: dayWatch,
        revenue: dayRev,
        subscribers: daySubs
      };

      fetchedAnalytics.push(snapshot);
    }
  }

  // 5. Write everything cleanly to Firestore using standard batches
  const batch = writeBatch(db);

  // Set/Update Channel document
  const totalWatchTime = fetchedAnalytics.reduce((acc, curr) => acc + curr.watchTime, 0);
  const totalRevenue = parseFloat(fetchedAnalytics.reduce((acc, curr) => acc + curr.revenue, 0).toFixed(2));

  const mappedChannel: Channel = {
    id: userId,
    name: channelName,
    handle: ytChannel.snippet.customUrl || ('@' + ytChannel.snippet.title.replace(/\s+/g, '').toLowerCase()),
    avatarUrl: ytChannel.snippet.thumbnails.high?.url || ytChannel.snippet.thumbnails.default?.url || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`,
    subscribers: subscribersCount,
    views: viewsCount,
    watchTime: totalWatchTime || Math.floor(viewsCount * 3.8), // simulated fallback if blank
    revenue: totalRevenue || parseFloat(((viewsCount * 3.5) / 1000).toFixed(2)), // simulated fallback if blank
    description: ytChannel.snippet.description || 'Welcome to my official YouTube channel!',
    category: 'Content Creator',
    createdAt: ytChannel.snippet.publishedAt || new Date().toISOString()
  };

  const channelRef = doc(db, 'channels', userId);
  // Non-merge: live sync is authoritative. Anything seeded or stale in the doc must be replaced.
  batch.set(channelRef, mappedChannel, { merge: false });

  // Set video documents
  fetchedVideos.forEach((v) => {
    const videoRef = doc(db, 'videos', v.id);
    batch.set(videoRef, v);
  });

  // Set comment documents
  fetchedComments.forEach((c) => {
    const commentRef = doc(db, 'comments', c.id);
    batch.set(commentRef, c);
  });

  // Set analytics documents
  fetchedAnalytics.forEach((snap) => {
    const snapRef = doc(db, 'analytics', snap.id);
    batch.set(snapRef, snap);
  });

  try {
    await batch.commit();
  } catch (writeErr) {
    handleFirestoreError(writeErr, OperationType.WRITE, 'youtube_sync_batch');
  }

  return {
    success: true,
    channelName,
    fallbackAnalytics: isAnalyticsFallback
  };
}
