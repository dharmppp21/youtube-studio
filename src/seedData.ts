import { doc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Video, Comment, AnalyticsSnapshot, Channel } from './types';

export async function seedChannelData(userId: string, email: string) {
  const batch = writeBatch(db);

  // 1. Create Channel Profile
  //
  // Sandbox demo: write zero totals so the dashboard doesn't show fabricated
  // numbers. The real channel.analytics values arrive via syncAllYouTubeData
  // once the user connects YouTube (or stays at 0 if they don't).
  const channelId = userId;
  const channelData: Channel = {
    id: userId,
    name: email.split('@')[0].toUpperCase() + ' GAMING',
    handle: '@' + email.split('@')[0].toLowerCase(),
    avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`,
    subscribers: 0,
    views: 0,
    watchTime: 0,
    revenue: 0,
    description: 'Welcome to daddugaming! Here we stream and post daily highlights of RPGs, FPSs, and action games, while discussing gaming tech and reviewing recent releases. Subscribe for the best gaming guides!',
    category: 'Gaming',
    createdAt: new Date().toISOString()
  };

  const channelRef = doc(db, 'channels', channelId);
  batch.set(channelRef, channelData);

  // 2. Generate 30 days of Analytics
  //
  // Sandbox demo: write honest zero snapshots instead of fabricated daily metrics.
  // Real channel.analytics values appear after the user runs a live YouTube sync
  // (see youtubeApi.ts -> syncAllYouTubeData). Until then, the dashboard shows 0
  // for views/watch/revenue/subs rather than fake numbers that would mislead.
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

    const snapRef = doc(db, 'analytics', snapshotId);
    batch.set(snapRef, snapshot);
  }

  // Channel totals are already 0 from the placeholder above; real numbers
  // arrive via syncAllYouTubeData after the user connects their YouTube account.

  // 3. Create 5 sample videos
  const videos: Video[] = [
    {
      id: 'video_1',
      ownerId: userId,
      title: 'How to Beat the Hardest Boss in Elden Ring (Complete Solo Guide)',
      description: 'Struggling with Malenia or the Elden Beast? In this video, I break down the exact strategies, builds, gear, and attack patterns to easily solo every difficult boss in Elden Ring! Perfect for newcomers and seasoned tarnished alike.\n\nTimestamps:\n0:00 Intro\n1:20 Recommended Stats & Gear\n3:45 Attack Pattern Analysis\n6:10 Phase 1 Strategy\n8:30 Phase 2 Walkthrough\n11:00 Final Tips',
      thumbnailUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80',
      visibility: 'public',
      category: 'Gaming',
      tags: ['elden ring', 'elden ring boss guide', 'how to beat malenia', 'elden ring tips', 'gaming guide'],
      views: 145000,
      likes: 8400,
      commentsCount: 24,
      duration: '12:45',
      watchTime: 18200,
      revenue: 725.00,
      status: 'ready',
      createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'video_2',
      ownerId: userId,
      title: 'Top 10 Hidden Gem RPGs You Need to Play in 2026',
      description: 'Looking for your next epic role-playing adventure? These are 10 incredible indie RPGs and overlooked masterpieces that deserve way more attention. No major franchises here—only pure, underrated storytelling and deep gameplay mechanics!',
      thumbnailUrl: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=600&q=80',
      visibility: 'public',
      category: 'Gaming',
      tags: ['hidden gems', 'rpg 2026', 'best indie rpgs', 'underrated games', 'rpg gameplay'],
      views: 82000,
      likes: 4100,
      commentsCount: 15,
      duration: '10:15',
      watchTime: 8200,
      revenue: 410.00,
      status: 'ready',
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'video_3',
      ownerId: userId,
      title: 'Is This $1,500 Gaming Handheld Actually Worth It?',
      description: 'We are testing the ultimate luxury high-end portable PC handheld. Can it handle Cyberpunk 2077 at high settings? Is the battery life serviceable, or is it just overpriced tech-larping? Let\'s find out!',
      thumbnailUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80',
      visibility: 'public',
      category: 'Science & Technology',
      tags: ['gaming handheld', 'portable pc', 'steam deck killer', 'tech review', 'gaming console'],
      views: 215000,
      likes: 12500,
      commentsCount: 42,
      duration: '15:20',
      watchTime: 32000,
      revenue: 1420.00,
      status: 'ready',
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'video_4',
      ownerId: userId,
      title: 'My Custom Cyberpunk PC Build V2 (Timelapse + Setup)',
      description: 'After 3 weeks of custom liquid cooling loops, custom acrylic engraving, and cables routing, the cyberpunk battle station upgrade is complete! Take a look at the full speed-build and the gorgeous final desk setup.',
      thumbnailUrl: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=600&q=80',
      visibility: 'public',
      category: 'Science & Technology',
      tags: ['pc build', 'cyberpunk pc', 'custom gaming pc', 'setup tour', 'battlestation'],
      views: 95000,
      likes: 6800,
      commentsCount: 18,
      duration: '08:50',
      watchTime: 9500,
      revenue: 450.00,
      status: 'ready',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'video_5',
      ownerId: userId,
      title: 'Why I Am Quitting Competetive Ranked Streaming...',
      description: 'It is time for an honest talk about gamer burnout, the toxicity of ranked match environments, and how chasing the algorithm can ruin the hobbies we love. Thank you all for the support.',
      thumbnailUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
      visibility: 'private',
      category: 'Entertainment',
      tags: ['ranked burnout', 'gaming discussion', 'mental health gaming', 'gaming creator', 'daddugaming'],
      views: 12000,
      likes: 950,
      commentsCount: 8,
      duration: '14:10',
      watchTime: 1800,
      revenue: 60.00,
      status: 'ready',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  for (const v of videos) {
    const videoRef = doc(db, 'videos', v.id);
    batch.set(videoRef, v);
  }

  // 4. Create sample comments
  const sampleComments: Comment[] = [
    {
      id: 'comment_1',
      videoId: 'video_1',
      videoTitle: 'How to Beat the Hardest Boss in Elden Ring (Complete Solo Guide)',
      ownerId: userId,
      authorName: 'Alex Mercer',
      authorAvatarUrl: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Alex',
      content: 'Bro! This build literally saved my run. I was stuck on Malenia for 4 days, but the posture-break strategy you outlined in phase 1 worked first try! Sending you a super thanks next time!',
      likes: 124,
      hasHeart: true,
      isPinned: true,
      createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      reply: 'So glad it helped, Alex! Posture breaking is definitely the secret key. Keep rocking it!',
      repliedAt: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'comment_2',
      videoId: 'video_1',
      videoTitle: 'How to Beat the Hardest Boss in Elden Ring (Complete Solo Guide)',
      ownerId: userId,
      authorName: 'Sarah Jenkins',
      authorAvatarUrl: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Sarah',
      content: 'Can you do a guide on the best intelligence/mage build for DLC bosses? I struggle so much playing as a spellcaster with high casting delays.',
      likes: 45,
      hasHeart: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'comment_3',
      videoId: 'video_3',
      videoTitle: 'Is This $1,500 Gaming Handheld Actually Worth It?',
      ownerId: userId,
      authorName: 'GamerGuy99',
      authorAvatarUrl: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=GamerGuy',
      content: 'Honestly $1500 is way too expensive when you can get a regular Steam Deck for $400. Yes, the screen is nicer, but who is buying this?',
      likes: 312,
      hasHeart: true,
      isPinned: false,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'comment_4',
      videoId: 'video_3',
      videoTitle: 'Is This $1,500 Gaming Handheld Actually Worth It?',
      ownerId: userId,
      authorName: 'TechHead_Mark',
      authorAvatarUrl: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Mark',
      content: 'Great review! Loved the deep dive into thermal throttling. Most reviewers miss how bad the frame pacing gets after 30 mins of play.',
      likes: 88,
      hasHeart: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'comment_5',
      videoId: 'video_2',
      videoTitle: 'Top 10 Hidden Gem RPGs You Need to Play in 2026',
      ownerId: userId,
      authorName: 'Luna_Valkyrie',
      authorAvatarUrl: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Luna',
      content: 'Number 4 (The Sunken Spires) is absolute art! The soundtrack alone is a 10/10. Thank you so much for putting it on the list, literally bought it immediately.',
      likes: 56,
      hasHeart: true,
      isPinned: false,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      reply: 'Awesome! Enjoy your playthrough, Luna. Let me know what you think of the major plot twist in chapter 3!',
      repliedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'comment_6',
      videoId: 'video_4',
      videoTitle: 'My Custom Cyberpunk PC Build V2 (Timelapse + Setup)',
      ownerId: userId,
      authorName: 'Build_Guru',
      authorAvatarUrl: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Guru',
      content: 'That liquid routing is masterclass. How did you get those perfect 90 degree bends without any kinking in the tubes?',
      likes: 29,
      hasHeart: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  for (const c of sampleComments) {
    const commentRef = doc(db, 'comments', c.id);
    batch.set(commentRef, c);
  }

  try {
    await batch.commit();
    console.log('Successfully seeded database for user:', userId);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'channels_and_dependencies');
  }
}
