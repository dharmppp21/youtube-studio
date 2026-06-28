import React, { useState } from 'react';
import { Video } from '../types';
import { 
  Search, SlidersHorizontal, Eye, ThumbsUp, MessageSquare, 
  Trash2, Edit, Plus, X, Sparkles, Loader2, Play, AlertCircle 
} from 'lucide-react';

interface VideoManagerViewProps {
  videos: Video[];
  onUploadVideo: (video: Omit<Video, 'id' | 'ownerId' | 'views' | 'likes' | 'commentsCount' | 'watchTime' | 'revenue' | 'status' | 'createdAt'>) => Promise<void>;
  onUpdateVideo: (video: Video) => Promise<void>;
  onDeleteVideo: (videoId: string) => Promise<void>;
}

export default function VideoManagerView({ videos, onUploadVideo, onUpdateVideo, onDeleteVideo }: VideoManagerViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'unlisted' | 'private'>('all');
  
  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  // Form states for Upload
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newVisibility, setNewVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
  const [newCategory, setNewCategory] = useState('Gaming');
  const [newTagsString, setNewTagsString] = useState('');
  const [newThumbnail, setNewThumbnail] = useState('https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80');
  const [newDuration, setNewDuration] = useState('10:00');

  // AI Loading states
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Form states for Edit
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editVisibility, setEditVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
  const [editCategory, setEditCategory] = useState('');
  const [editTagsString, setEditTagsString] = useState('');
  const [editThumbnail, setEditThumbnail] = useState('');

  // Handle Search and Filters
  const filteredVideos = videos.filter(video => {
    const matchesSearch = video.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          video.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesVisibility = visibilityFilter === 'all' || video.visibility === visibilityFilter;
    return matchesSearch && matchesVisibility;
  });

  // Handle Upload Submission
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const tags = newTagsString.split(',').map(t => t.trim()).filter(Boolean);
    
    await onUploadVideo({
      title: newTitle,
      description: newDescription,
      thumbnailUrl: newThumbnail,
      visibility: newVisibility,
      category: newCategory,
      tags,
      duration: newDuration
    });

    // Reset Form
    setNewTitle('');
    setNewDescription('');
    setNewVisibility('public');
    setNewCategory('Gaming');
    setNewTagsString('');
    setIsUploadModalOpen(false);
  };

  // Open Edit Modal
  const openEditModal = (video: Video) => {
    setSelectedVideo(video);
    setEditTitle(video.title);
    setEditDescription(video.description);
    setEditVisibility(video.visibility);
    setEditCategory(video.category);
    setEditTagsString(video.tags.join(', '));
    setEditThumbnail(video.thumbnailUrl);
    setIsEditModalOpen(true);
  };

  // Handle Edit Submission
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVideo || !editTitle.trim()) return;

    const tags = editTagsString.split(',').map(t => t.trim()).filter(Boolean);

    await onUpdateVideo({
      ...selectedVideo,
      title: editTitle,
      description: editDescription,
      visibility: editVisibility,
      category: editCategory,
      tags,
      thumbnailUrl: editThumbnail
    });

    setIsEditModalOpen(false);
    setSelectedVideo(null);
  };

  // Trigger Gemini SEO Optimizer inside Modal
  const handleOptimizeWithAI = async (isEdit: boolean) => {
    const titleToOptimize = isEdit ? editTitle : newTitle;
    const categoryToUse = isEdit ? editCategory : newCategory;

    if (!titleToOptimize.trim()) {
      alert("Please enter a title first so our AI has context to write optimizations!");
      return;
    }

    setIsAiLoading(true);
    setAiError(null);

    try {
      const res = await fetch('/api/generate-seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleToOptimize, category: categoryToUse })
      });

      if (!res.ok) {
        throw new Error("Could not contact the Gemini SEO Engine.");
      }

      const data = await res.json();
      
      if (isEdit) {
        setEditTitle(data.alternativeTitles?.[0] || editTitle);
        setEditDescription(data.optimizedDescription || editDescription);
        setEditTagsString((data.suggestedTags || []).join(', '));
      } else {
        setNewTitle(data.alternativeTitles?.[0] || newTitle);
        setNewDescription(data.optimizedDescription || newDescription);
        setNewTagsString((data.suggestedTags || []).join(', '));
      }
    } catch (err: any) {
      setAiError(err.message || "SEO Generation failed.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="video-manager-container">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search channel videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1e1e1e] border border-[#333] rounded-sm pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 font-sans transition-all"
          />
        </div>

        {/* Visibility Filter & Upload button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#1e1e1e] border border-[#333] rounded-sm px-3 py-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={visibilityFilter}
              onChange={(e: any) => setVisibilityFilter(e.target.value)}
              className="bg-transparent border-none text-xs font-sans text-gray-300 focus:outline-none pr-2 cursor-pointer"
            >
              <option value="all">All Visibilities</option>
              <option value="public">Public Only</option>
              <option value="unlisted">Unlisted Only</option>
              <option value="private">Private Only</option>
            </select>
          </div>

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="px-4 py-2.5 bg-[#3ea6ff] hover:opacity-90 text-xs text-[#0f0f0f] font-bold rounded-sm transition-all flex items-center gap-1.5 font-sans cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Upload video
          </button>
        </div>
      </div>

      {/* Videos List */}
      <div className="bg-[#1e1e1e] border border-[#333] rounded-sm overflow-hidden" id="videos-table-wrapper">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-[#333] bg-[#282828]">
                <th className="px-6 py-4 text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Video</th>
                <th className="px-6 py-4 text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Visibility</th>
                <th className="px-6 py-4 text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider text-right">Views</th>
                <th className="px-6 py-4 text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider text-right">Likes</th>
                <th className="px-6 py-4 text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider text-right">Comments</th>
                <th className="px-6 py-4 text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#333]">
              {filteredVideos.length > 0 ? (
                filteredVideos.map((video) => (
                  <tr key={video.id} className="hover:bg-[#282828]/20 transition-colors">
                    {/* Video details thumbnail */}
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-4">
                        <div className="relative w-28 aspect-video rounded-sm overflow-hidden border border-[#333] bg-black flex-shrink-0">
                          <img 
                            src={video.thumbnailUrl} 
                            alt={video.title} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <span className="absolute bottom-1 right-1 px-1 bg-black/85 text-[9px] font-mono rounded-sm text-white">{video.duration}</span>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-xs font-bold font-sans text-white line-clamp-2 leading-snug">{video.title}</h4>
                          <p className="text-[10px] text-[#aaa] font-sans line-clamp-1">{video.description || 'No description'}</p>
                          <div className="flex flex-wrap gap-1">
                            {video.tags.slice(0, 3).map((tag, idx) => (
                              <span key={idx} className="px-1.5 py-0.5 bg-[#282828] text-[#aaa] font-mono text-[9px] rounded-sm">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Visibility badge */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-[9px] font-mono font-semibold rounded-sm uppercase tracking-wider ${
                        video.visibility === 'public' 
                          ? 'bg-[#282828] border border-[#333] text-green-500' 
                          : video.visibility === 'private'
                          ? 'bg-[#282828] border border-[#333] text-red-400'
                          : 'bg-[#282828] text-zinc-400'
                      }`}>
                        {video.visibility}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-[#aaa]">
                      {new Date(video.createdAt).toLocaleDateString()}
                    </td>

                    {/* Views */}
                    <td className="px-6 py-4 text-right whitespace-nowrap text-xs font-bold font-mono text-white">
                      {video.views.toLocaleString()}
                    </td>

                    {/* Likes */}
                    <td className="px-6 py-4 text-right whitespace-nowrap text-xs font-mono text-gray-300">
                      {video.likes.toLocaleString()}
                    </td>

                    {/* Comments */}
                    <td className="px-6 py-4 text-right whitespace-nowrap text-xs font-mono text-gray-300">
                      {video.commentsCount}
                    </td>

                    {/* Action buttons */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(video)}
                          className="p-2 hover:bg-[#282828] text-gray-400 hover:text-white rounded-sm transition-colors cursor-pointer"
                          title="Edit details"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteVideo(video.id)}
                          className="p-2 hover:bg-red-950/40 text-gray-500 hover:text-red-400 rounded-sm transition-colors cursor-pointer"
                          title="Delete video"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-[#aaa] font-sans text-xs">
                    No videos match your filters. Upload or generate a video idea to get started!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Video Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e1e1e] border border-[#333] rounded-md w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-[#333] flex items-center justify-between">
              <h3 className="text-base font-bold font-sans text-white flex items-center gap-2">
                <Play className="w-4 h-4 text-red-500 animate-pulse" /> Upload Creator Video
              </h3>
              <button 
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1 hover:bg-[#282828] rounded-sm text-[#aaa] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4 text-left">
              <div className="space-y-1">
                <label className="text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Video Working Title</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Enter working title (e.g. My Custom Mechanical Keyboard Tour)"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="flex-1 bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => handleOptimizeWithAI(false)}
                    disabled={isAiLoading}
                    className="px-3 bg-[#3ea6ff]/10 border border-[#3ea6ff]/20 text-[#3ea6ff] rounded-sm hover:bg-[#3ea6ff]/20 text-xs font-bold transition-all flex items-center gap-1 font-sans cursor-pointer shadow"
                  >
                    {isAiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    AI SEO
                  </button>
                </div>
              </div>

              {aiError && (
                <div className="p-3 bg-red-950/20 border border-red-900/30 text-red-400 text-xs rounded-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Description (Optimized for Search)</label>
                <textarea
                  placeholder="Enter video description..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={4}
                  className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Video Visibility</label>
                  <select
                    value={newVisibility}
                    onChange={(e: any) => setNewVisibility(e.target.value)}
                    className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans cursor-pointer"
                  >
                    <option value="public" className="bg-[#1e1e1e]">Public</option>
                    <option value="unlisted" className="bg-[#1e1e1e]">Unlisted</option>
                    <option value="private" className="bg-[#1e1e1e]">Private</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans cursor-pointer"
                  >
                    <option value="Gaming" className="bg-[#1e1e1e]">Gaming</option>
                    <option value="Science & Technology" className="bg-[#1e1e1e]">Science & Technology</option>
                    <option value="Howto & Style" className="bg-[#1e1e1e]">Howto & Style</option>
                    <option value="Education" className="bg-[#1e1e1e]">Education</option>
                    <option value="Entertainment" className="bg-[#1e1e1e]">Entertainment</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Tags (comma-separated)</label>
                <input
                  type="text"
                  placeholder="gaming, setup, review"
                  value={newTagsString}
                  onChange={(e) => setNewTagsString(e.target.value)}
                  className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Stock Thumbnail URL</label>
                  <input
                    type="text"
                    required
                    value={newThumbnail}
                    onChange={(e) => setNewThumbnail(e.target.value)}
                    className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Video Duration</label>
                  <input
                    type="text"
                    required
                    placeholder="mm:ss (e.g. 10:15)"
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                    className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[#333] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 bg-[#282828] border border-[#333] hover:bg-[#1e1e1e] text-xs text-white font-semibold rounded-sm transition-colors font-sans cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#3ea6ff] hover:opacity-95 text-xs text-[#0f0f0f] font-bold rounded-sm transition-colors font-sans cursor-pointer"
                >
                  Upload & Process
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Video Details Modal */}
      {isEditModalOpen && selectedVideo && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e1e1e] border border-[#333] rounded-md w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-[#333] flex items-center justify-between">
              <h3 className="text-base font-bold font-sans text-white flex items-center gap-2">
                <Edit className="w-4 h-4 text-red-500" /> Edit Video Details
              </h3>
              <button 
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedVideo(null);
                }}
                className="p-1 hover:bg-[#282828] rounded-sm text-[#aaa] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4 text-left">
              <div className="space-y-1">
                <label className="text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Video Title</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => handleOptimizeWithAI(true)}
                    disabled={isAiLoading}
                    className="px-3 bg-[#3ea6ff]/10 border border-[#3ea6ff]/20 text-[#3ea6ff] rounded-sm hover:bg-[#3ea6ff]/20 text-xs font-bold transition-all flex items-center gap-1 font-sans cursor-pointer shadow"
                  >
                    {isAiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    AI SEO
                  </button>
                </div>
              </div>

              {aiError && (
                <div className="p-3 bg-red-950/20 border border-red-900/30 text-red-400 text-xs rounded-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Video Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={6}
                  className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Visibility</label>
                  <select
                    value={editVisibility}
                    onChange={(e: any) => setEditVisibility(e.target.value)}
                    className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans cursor-pointer"
                  >
                    <option value="public" className="bg-[#1e1e1e]">Public</option>
                    <option value="unlisted" className="bg-[#1e1e1e]">Unlisted</option>
                    <option value="private" className="bg-[#1e1e1e]">Private</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans cursor-pointer"
                  >
                    <option value="Gaming" className="bg-[#1e1e1e]">Gaming</option>
                    <option value="Science & Technology" className="bg-[#1e1e1e]">Science & Technology</option>
                    <option value="Howto & Style" className="bg-[#1e1e1e]">Howto & Style</option>
                    <option value="Education" className="bg-[#1e1e1e]">Education</option>
                    <option value="Entertainment" className="bg-[#1e1e1e]">Entertainment</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={editTagsString}
                  onChange={(e) => setEditTagsString(e.target.value)}
                  className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold font-sans text-[#aaa] uppercase tracking-wider">Thumbnail Image URL</label>
                <input
                  type="text"
                  required
                  value={editThumbnail}
                  onChange={(e) => setEditThumbnail(e.target.value)}
                  className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                />
              </div>

              <div className="pt-4 border-t border-[#333] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedVideo(null);
                  }}
                  className="px-4 py-2 bg-[#282828] border border-[#333] hover:bg-[#1e1e1e] text-xs text-white font-semibold rounded-sm transition-colors font-sans cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#3ea6ff] hover:opacity-95 text-xs text-[#0f0f0f] font-bold rounded-sm transition-colors font-sans cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
