export interface Channel {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string;
  subscribers: number;
  views: number;
  watchTime: number;
  revenue: number;
  description: string;
  category: string;
  createdAt: string;
}

export interface Video {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  visibility: 'public' | 'unlisted' | 'private';
  category: string;
  tags: string[];
  views: number;
  likes: number;
  commentsCount: number;
  duration: string;
  watchTime: number;
  revenue: number;
  status: 'uploaded' | 'processing' | 'ready';
  createdAt: string;
}

export interface Comment {
  id: string;
  videoId: string;
  videoTitle: string;
  ownerId: string;
  authorName: string;
  authorAvatarUrl: string;
  content: string;
  likes: number;
  hasHeart: boolean;
  isPinned: boolean;
  reply?: string;
  repliedAt?: string;
  createdAt: string;
}

export interface AnalyticsSnapshot {
  id: string;
  ownerId: string;
  date: string;
  views: number;
  watchTime: number;
  revenue: number;
  subscribers: number;
}
