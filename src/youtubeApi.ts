import { doc, writeBatch, collection, getDocs, getDoc, query, where, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Channel, Video, Comment, AnalyticsSnapshot } from './types';

// YouTube API limits - made configurable for easier adjustment
const YOUTUBE_PLAYLIST_ITEMS_LIMIT = 15;
const YOUTUBE_COMMENT_THREADS_LIMIT = 20;

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
 * Added safety logging for audit purposes.
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
      if (import.meta.env.DEV) console.info(`🧹 Clearing placeholder channel doc for user ${userId}: "${name}" (${handle})`);
      await deleteDoc(channelRef);
      if (import.meta.env.DEV) console.info(`✅ Placeholder channel doc cleared for user ${userId}`);
    }
  } catch (err) {
    console.warn("Failed to clear previous channel placeholder:", err);
  }
}

/**
 * Clean up existing seeded/simulated documents in Firestore for a user
 * before writing their real YouTube channel data to avoid duplicate/mixed views.
 Added safety logging and error handling.
 */
async function clearPreviousSeededData(userId: string) {
  try {
    const batch = writeBatch(db);
    let deleteCount = 0;

    // 1. Fetch and delete videos
    const qVideos = query(collection(db, 'videos'), where('ownerId', '==', userId));
    const snapVideos = await getDocs(qVideos);
    snapVideos.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });

    // 2. Fetch and delete comments
    const qComments = query(collection(db, 'comments'), where('ownerId', '==', userId));
    const snapComments = await getDocs(qComments);
    snapComments.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });

    // 3. Fetch and delete analytics
    const qAnalytics = query(collection(db, 'analytics'), where('ownerId', '==', userId));
    const snapAnalytics = await getDocs(qAnalytics);
    snapAnalytics.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });

    if (deleteCount > 0) {
      if (import.meta.env.DEV) console.info(`🧹 Clearing ${deleteCount} previously seeded documents for user ${userId}`);
      await batch.commit();
      if (import.meta.env.DEV) console.info(`✅ Cleared ${deleteCount} previously seeded documents for user ${userId}`);
    }
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
      const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails,status&playlistId=${uploadsPlaylistId}&maxResults=${YOUTUBE_PLAYLIST_ITEMS_LIMIT}`;
      const playlistRes = await fetch(playlistUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (playlistRes.ok) {
        const playlistJson = await playlistRes.json();
        const items = playlistJson.items || [];
        const videoIds = items.map((item: { contentDetails?: { videoId?: string } | null }) => item.contentDetails?.videoId).filter(Boolean);

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

              // Basic validation for video data
              const validVideoId = v.id && typeof v.id === 'string' && v.id.trim() !== '';
              const validTitle = v.snippet?.title && typeof v.snippet?.title === 'string' && v.snippet?.title.trim() !== '';
              const validThumbnailUrl = typeof v.snippet?.thumbnails?.high?.url === 'string' &&
                                      v.snippet?.thumbnails?.high?.url.startsWith('http');

              if (!validVideoId || !validTitle || !validThumbnailUrl) {
                console.warn('Skipping video due to invalid data:', {
                  videoId: v.id,
                  hasValidId: validVideoId,
                  hasValidTitle: validTitle,
                  hasValidThumbnail: validThumbnailUrl
                });
                return; // Skip this video
              }

              const mappedVideo: Video = {
                id: v.id.trim(),
                ownerId: userId,
                title: v.snippet?.title?.trim() || `Video #${index + 1}`,
                description: v.snippet?.description?.trim() || '',
                thumbnailUrl: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80',
                visibility: (v.status?.privacyStatus || 'public') as 'public' | 'unlisted' | 'private',
                category: mapCategoryId(v.snippet?.categoryId) || 'Entertainment',
                tags: Array.isArray(v.snippet?.tags) ? v.snippet?.tags.filter(tag => typeof tag === 'string') : [],
                views: Math.max(0, vViews), // Ensure non-negative
                likes: Math.max(0, vLikes), // Ensure non-negative
                commentsCount: Math.max(0, vComments), // Ensure non-negative
                duration: parseISODuration(v.contentDetails?.duration) || '0:00',
                watchTime: 0, // per-video watch time requires the Analytics API; leave 0 to avoid faking
                revenue: 0,   // per-video revenue requires the YouTube Analytics API; leave 0 to avoid faking
                status: 'ready',
                createdAt: v.snippet?.publishedAt || new Date().toISOString()
              };

              fetchedVideos.push(mappedVideo);
              videoTitleMap[v.id] = mappedVideo.title;
            });
          } else {
            console.warn(`YouTube videos API returned ${videosRes.status}: ${videosRes.statusText}`);
          }
        }
      } else {
        console.warn(`YouTube playlist API returned ${playlistRes.status}: ${playlistRes.statusText}`);
      }
    } catch (vErr) {
      console.warn("Error fetching live YouTube videos:", vErr);
      // Continue with empty videos array rather than failing the entire sync
      // In a production app, we might want to show a user notification here
    }
  }

  // 3. Fetch YouTube Comments
  const fetchedComments: Comment[] = [];
  try {
    const commentsUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&allThreadsRelatedToChannelId=true&maxResults=${YOUTUBE_COMMENT_THREADS_LIMIT}`;
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

        // Basic validation for comment data
        const validCommentId = cId && typeof cId === 'string' && cId.trim() !== '';
        const validVideoId = vId && typeof vId === 'string' && vId.trim() !== '';
        const validAuthorName = ((authorSnippet?.authorDisplayName || 'Anonymous Viewer').trim() || 'Unknown Viewer').length > 0;
        const validContent = ((authorSnippet?.textOriginal || authorSnippet?.textDisplay || '').trim()).length > 0;

        if (!validCommentId || !validVideoId || !validAuthorName || !validContent) {
          console.warn('Skipping comment due to invalid data:', {
            commentId: cId,
            videoId: vId,
            hasValidCommentId: validCommentId,
            hasValidVideoId: validVideoId,
            hasValidAuthorName: validAuthorName,
            hasValidContent: validContent
          });
          return; // Skip this comment
        }

        const mappedComment: Comment = {
          id: cId.trim(),
          videoId: vId.trim(),
          videoTitle: (videoTitleMap[vId] || 'Recent Video Upload').substring(0, 100), // Limit length
          ownerId: userId,
          authorName: (authorSnippet?.authorDisplayName || 'Anonymous Viewer').trim().substring(0, 100), // Limit length
          authorAvatarUrl: authorSnippet?.authorProfileImageUrl || 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Viewer',
          content: (authorSnippet?.textOriginal || authorSnippet?.textDisplay || '').trim().substring(0, 10000), // Reasonable limit
          likes: Math.max(0, parseInt(authorSnippet?.likeCount) || 0),
          hasHeart: !!ownerReplyText,
          isPinned: false,
          reply: ownerReplyText?.trim()?.substring(0, 1000) || undefined, // Limit length
          repliedAt: ownerRepliedAt,
          createdAt: authorSnippet?.publishedAt || new Date().toISOString()
        };

        fetchedComments.push(mappedComment);
      });
    } else {
      console.warn(`YouTube comments API returned ${commentsRes.status}: ${commentsRes.statusText}`);
      // Continue with empty comments rather than failing
    }
  } catch (cErr) {
    console.warn("Error fetching live YouTube comments:", cErr);
    // Continue with empty comments rather than failing the entire sync
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
        const dayMinutes = parseInt(row[4]) || 0;
        const daySubscribers = parseInt(row[5]) || 0;

        const snapshotId = `${userId}_${dateStr}`;
        const snapshot: AnalyticsSnapshot = {
          id: snapshotId,
          ownerId: userId,
          date: dateStr,
          views: Math.max(0, dayViews), // Ensure non-negative
          // YouTube Analytics returns estimatedMinutesWatched; convert to hours to
          // match the unit used everywhere the UI renders watchTime ("Watch Time (Hours)")
          // and the manual generator in ChannelSettingsView. Kept as a fractional hour
          // (2dp) so per-day charts stay meaningful for small channels and the summed
          // total below is accurate.
          watchTime: Math.max(0, parseFloat((dayMinutes / 60).toFixed(2))), // hours (real from YouTube Analytics)
          revenue: 0, // YouTube Analytics API does not return estimatedRevenue at this scope; honest 0 until we add a dedicated query
          subscribers: Math.max(0, daySubscribers) // Ensure non-negative
        };

        fetchedAnalytics.push(snapshot);
      });
    } else {
      console.warn(`YouTube Analytics API returned ${analyticsRes.status}: ${analyticsRes.statusText}`);
      isAnalyticsFallback = true;
    }
  } catch (aErr) {
    console.warn("Error fetching YouTube Analytics API, falling back to zero values:", aErr);
    isAnalyticsFallback = true;
  }

  // If YouTube Analytics was unavailable, write honest zero snapshots instead of fake data.
  // Channel doc will report 0 watchTime / 0 revenue, which reflects reality for a new channel.
  if (isAnalyticsFallback || fetchedAnalytics.length === 0) {
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - 30);

    for (let i = 0; i < 30; i++) {
      const dateStr = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const snapshotId = `${userId}_${dateStr}`;
      const snapshot: AnalyticsSnapshot = {
        id: snapshotId,
        ownerId: userId,
        date: dateStr,
        views: 0,
        watchTime: 0,
        revenue: 0,
        subscribers: 0
      };

      fetchedAnalytics.push(snapshot);
    }
  }

  // 5. Write everything cleanly to Firestore using standard batches
  const batch = writeBatch(db);

  // Set/Update Channel document
  const totalWatchTime = parseFloat(fetchedAnalytics.reduce((acc, curr) => acc + curr.watchTime, 0).toFixed(2)); // hours
  const totalRevenue = parseFloat(fetchedAnalytics.reduce((acc, curr) => acc + curr.revenue, 0).toFixed(2));

  // Basic validation for channel data
  const validUserId = userId && typeof userId === 'string' && userId.trim() !== '';
  const validChannelName = channelName && typeof channelName === 'string' && channelName.trim() !== '';
  const validDescription = typeof ytChannel.snippet.description === 'string' ? ytChannel.snippet.description.trim() : '';

  if (!validUserId || !validChannelName) {
    throw new Error('Invalid channel data received from YouTube API');
  }

  const mappedChannel: Channel = {
    id: userId.trim(),
    name: channelName.trim(),
    handle: (ytChannel.snippet.customUrl || ('@' + ytChannel.snippet.title.replace(/\s+/g, '').toLowerCase())).trim() || `@${userId.substring(0, 8)}`,
    avatarUrl: (ytChannel.snippet.thumbnails.high?.url || ytChannel.snippet.thumbnails.default?.url || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`).toString(),
    subscribers: Math.max(0, subscribersCount), // Ensure non-negative
    views: Math.max(0, viewsCount), // Ensure non-negative
    watchTime: Math.max(0, totalWatchTime), // honest: 0 if Analytics unavailable, real sum if available
    revenue: Math.max(0, totalRevenue),     // honest: 0 if Analytics unavailable, real sum if available
    description: validDescription.length > 0 ? validDescription : 'Welcome to my official YouTube channel!',
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
    if (import.meta.env.DEV) console.info(`✅ Successfully wrote ${fetchedVideos.length} videos, ${fetchedComments.length} comments, and ${fetchedAnalytics.length} analytics snapshots to Firestore for user ${userId}`);
  } catch (writeErr) {
    console.error("Failed to write YouTube sync data to Firestore:", writeErr);
    // Still throw the error so the calling code knows the sync failed
    throw new Error(`Failed to save YouTube data to database: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`);
  }

  return {
    success: true,
    channelName,
    fallbackAnalytics: isAnalyticsFallback
  };
}
