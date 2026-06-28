import React, { useState } from 'react';
import { Comment } from '../types';
import { 
  Search, Check, Heart, Pin, Sparkles, MessageSquare, 
  Trash2, Send, Loader2, RefreshCw, AlertCircle, HelpCircle 
} from 'lucide-react';

interface CommentModeratorViewProps {
  comments: Comment[];
  onReplyToComment: (commentId: string, replyText: string) => Promise<void>;
  onToggleHeart: (commentId: string, currentHeart: boolean) => Promise<void>;
  onTogglePin: (commentId: string, currentPin: boolean) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}

export default function CommentModeratorView({ 
  comments, onReplyToComment, onToggleHeart, onTogglePin, onDeleteComment 
}: CommentModeratorViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUnanswered, setFilterUnanswered] = useState(false);
  const [replyInputs, setReplyInputs] = useState<{ [commentId: string]: string }>({});

  // AI states
  const [aiLoadingStates, setAiLoadingStates] = useState<{ [commentId: string]: boolean }>({});
  const [aiTones, setAiTones] = useState<{ [commentId: string]: 'warm' | 'helpful' | 'witty' | 'funny' }>({});

  const filteredComments = comments.filter(comment => {
    const matchesSearch = comment.content.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          comment.authorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          comment.videoTitle.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesUnanswered = !filterUnanswered || !comment.reply;
    return matchesSearch && matchesUnanswered;
  });

  const handleReplyChange = (commentId: string, text: string) => {
    setReplyInputs(prev => ({ ...prev, [commentId]: text }));
  };

  const handleReplySubmit = async (commentId: string) => {
    const text = replyInputs[commentId];
    if (!text || !text.trim()) return;

    await onReplyToComment(commentId, text.trim());
    // Clear input
    setReplyInputs(prev => {
      const updated = { ...prev };
      delete updated[commentId];
      return updated;
    });
  };

  const handleGenerateAiReply = async (comment: Comment) => {
    const tone = aiTones[comment.id] || 'warm';
    setAiLoadingStates(prev => ({ ...prev, [comment.id]: true }));

    try {
      const res = await fetch('/api/generate-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentText: comment.content,
          videoTitle: comment.videoTitle,
          tone: tone === 'warm' ? 'warm and appreciative' : tone === 'helpful' ? 'informative and extremely helpful' : tone === 'witty' ? 'clever, witty, and slightly playful' : 'humorous and fun'
        })
      });

      if (!res.ok) {
        throw new Error("Could not contact the Gemini reply assistant.");
      }

      const data = await res.json();
      setReplyInputs(prev => ({ ...prev, [comment.id]: data.reply }));
    } catch (error) {
      alert("AI Reply generation failed. Please check your console.");
    } finally {
      setAiLoadingStates(prev => ({ ...prev, [comment.id]: false }));
    }
  };

  return (
    <div className="space-y-6" id="comments-manager-container">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search comment texts, authors, or video titles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1e1e1e] border border-[#333] rounded-sm pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 font-sans transition-all"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setFilterUnanswered(!filterUnanswered)}
            className={`px-4 py-2 text-xs font-semibold rounded-sm border transition-all flex items-center gap-1.5 font-sans cursor-pointer ${
              filterUnanswered 
                ? 'bg-[#ef4444]/15 border-red-500 text-white font-bold' 
                : 'bg-[#1e1e1e] border-[#333] text-[#aaa] hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {filterUnanswered ? 'Showing Unanswered' : 'Filter Unanswered'}
          </button>
        </div>
      </div>

      {/* Comment Cards List */}
      <div className="space-y-4" id="comments-list-wrapper">
        {filteredComments.length > 0 ? (
          filteredComments.map((comment) => (
            <div 
              key={comment.id} 
              className={`bg-[#1e1e1e] border border-[#333] rounded-sm p-5 space-y-4 transition-all hover:border-[#444] ${
                comment.isPinned ? 'ring-1 ring-red-500/30' : ''
              }`}
            >
              {/* Commenter header details */}
              <div className="flex items-start justify-between gap-4 text-left">
                <div className="flex items-center gap-3">
                  <img 
                    src={comment.authorAvatarUrl} 
                    alt={comment.authorName} 
                    className="w-9 h-9 rounded-full bg-zinc-800 border border-[#333] flex-shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-sans text-white">{comment.authorName}</span>
                      {comment.isPinned && (
                        <span className="text-[9px] bg-red-950 border border-red-900/30 text-red-400 px-1.5 py-0.5 rounded-sm font-mono flex items-center gap-0.5 font-semibold">
                          <Pin className="w-2.5 h-2.5" /> PINNED
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-sans text-[#aaa] mt-0.5">
                      on <span className="text-gray-300 font-medium">"{comment.videoTitle}"</span> • {new Date(comment.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onTogglePin(comment.id, comment.isPinned)}
                    className={`p-2 rounded-sm transition-colors cursor-pointer ${
                      comment.isPinned 
                        ? 'bg-red-950/40 text-red-400 hover:bg-red-950/20' 
                        : 'hover:bg-[#282828] text-gray-500 hover:text-white'
                    }`}
                    title={comment.isPinned ? "Unpin comment" : "Pin comment"}
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteComment(comment.id)}
                    className="p-2 hover:bg-red-950/40 text-gray-500 hover:text-red-400 rounded-sm transition-colors cursor-pointer"
                    title="Delete comment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Comment Content body */}
              <div className="pl-12 text-left">
                <p className="text-xs text-gray-200 font-sans leading-relaxed">
                  {comment.content}
                </p>

                {/* Comment interactions likes + heart */}
                <div className="flex items-center gap-4 mt-3">
                  <span className="text-[10px] font-mono text-[#aaa] flex items-center gap-1">
                    <ThumbsUpIcon className="w-3.5 h-3.5 text-gray-500" /> {comment.likes} likes
                  </span>

                  <button
                    onClick={() => onToggleHeart(comment.id, comment.hasHeart)}
                    className={`flex items-center gap-1 text-[10px] font-mono transition-colors cursor-pointer ${
                      comment.hasHeart 
                        ? 'text-red-500 hover:text-red-600' 
                        : 'text-gray-500 hover:text-white'
                    }`}
                    title={comment.hasHeart ? "Remove Heart" : "Heart comment"}
                  >
                    <Heart className={`w-3.5 h-3.5 ${comment.hasHeart ? 'fill-current' : ''}`} />
                    {comment.hasHeart ? 'Hearted' : 'Heart'}
                  </button>
                </div>

                {/* Existing Reply box */}
                {comment.reply && (
                  <div className="mt-4 p-3 bg-[#0f0f0f] border border-[#333] rounded-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold font-sans text-red-500">Your Channel Reply</span>
                      <Check className="w-3.5 h-3.5 text-emerald-400 bg-[#282828] border border-[#333] rounded-full p-0.5" />
                    </div>
                    <p className="text-xs text-gray-300 font-sans leading-relaxed">"{comment.reply}"</p>
                    {comment.repliedAt && (
                      <span className="block text-[9px] font-mono text-gray-500 mt-1">
                        Replied on {new Date(comment.repliedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}

                {/* Compose / Generate Reply section */}
                {!comment.reply && (
                  <div className="mt-4 bg-[#0f0f0f] border border-[#333] rounded-sm p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#333] pb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#3ea6ff] animate-pulse" />
                        <span className="text-xs font-bold font-sans text-white">AI Response Generator</span>
                      </div>
                      
                      {/* Tone selection */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-sans text-gray-400">Tone:</span>
                        <div className="flex gap-1">
                          {(['warm', 'helpful', 'witty', 'funny'] as const).map((tone) => (
                            <button
                              key={tone}
                              type="button"
                              onClick={() => setAiTones(prev => ({ ...prev, [comment.id]: tone }))}
                              className={`px-2 py-0.5 text-[9px] font-sans font-semibold uppercase tracking-wider rounded-sm border transition-all cursor-pointer ${
                                (aiTones[comment.id] || 'warm') === tone
                                  ? 'bg-[#3ea6ff]/10 border-[#3ea6ff]/25 text-[#3ea6ff]'
                                  : 'bg-[#1e1e1e] border-[#333] text-gray-500 hover:text-white'
                              }`}
                            >
                              {tone}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleGenerateAiReply(comment)}
                          disabled={aiLoadingStates[comment.id]}
                          className="ml-2 px-3 py-1 bg-[#3ea6ff] hover:opacity-90 disabled:bg-zinc-800 disabled:text-gray-500 text-[#0f0f0f] text-[10px] font-bold font-sans rounded-sm shadow-sm transition-all flex items-center gap-1 uppercase tracking-wider cursor-pointer"
                        >
                          {aiLoadingStates[comment.id] ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          Generate
                        </button>
                      </div>
                    </div>

                    {/* Compose Area */}
                    <div className="relative">
                      <textarea
                        placeholder="Type response or generate with AI..."
                        value={replyInputs[comment.id] || ''}
                        onChange={(e) => handleReplyChange(comment.id, e.target.value)}
                        rows={2}
                        className="w-full bg-[#1e1e1e] border border-[#333] rounded-sm pl-4 pr-12 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans resize-none"
                      />
                      <button
                        onClick={() => handleReplySubmit(comment.id)}
                        disabled={!replyInputs[comment.id]?.trim()}
                        className="absolute right-3.5 bottom-3.5 p-2 bg-[#3ea6ff] hover:opacity-90 disabled:bg-zinc-800 disabled:text-gray-500 text-[#0f0f0f] rounded-sm transition-colors cursor-pointer"
                        title="Send reply"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-16 bg-[#1e1e1e] border border-[#333] rounded-sm text-[#aaa] font-sans text-xs">
            No comments match your search parameters.
          </div>
        )}
      </div>
    </div>
  );
}

// Custom simple thumbsup icon
function ThumbsUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}
