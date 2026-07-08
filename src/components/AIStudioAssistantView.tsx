import { useState, useEffect, useRef } from 'react';
import {
  Sparkles, Loader2, Save, Clipboard, Check, Play, Copy,
  BookOpen, Video as VideoIcon, Search, Layers, X, Pause, FastForward, Rewind, Maximize
} from 'lucide-react';
import { authedFetch } from '../firebase';

/**
 * Best-effort extraction of a human-readable error message from a non-2xx
 * /api/* response. The server returns `{ error: { code, message } }` on
 * auth/parse failures, but it may also return a plain string or empty body.
 */
async function readServerError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body?.error?.message) return body.error.message;
    if (typeof body === 'string' && body.trim()) return body;
  } catch {
    // Body wasn't JSON; fall through.
  }
  return `${fallback} (HTTP ${res.status})`;
}

interface AIStudioAssistantViewProps {
  onAddDraftVideo: (draft: { title: string; description: string; category: string; tags: string[] }) => Promise<void>;
}

export default function AIStudioAssistantView({ onAddDraftVideo }: AIStudioAssistantViewProps) {
  const [activeAssistant, setActiveAssistant] = useState<'ideas' | 'seo' | 'script'>('ideas');

  // 1. Idea Generator State
  const [niche, setNiche] = useState('Gaming');
  const [keywords, setKeywords] = useState('');
  const [tone, setTone] = useState('Viral/Clickbait');
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  const [generatedIdeas, setGeneratedIdeas] = useState<Array<{
    title: string;
    description: string;
    targetAudience: string;
    difficulty: string;
    ctrStrength: string;
    angle: string;
  }>>([]);
  const [savedIdeaIndices, setSavedIdeaIndices] = useState<{ [key: number]: boolean }>({});

  // 2. SEO Copywriter State
  const [seoTitle, setSeoTitle] = useState('');
  const [seoCategory, setSeoCategory] = useState('Gaming');
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [generatedSeo, setGeneratedSeo] = useState<{
    alternativeTitles: string[];
    optimizedDescription: string;
    suggestedTags: string[];
  } | null>(null);
  const [copiedField, setCopiedField] = useState<'desc' | 'tags' | null>(null);

  // 3. Script Writer State
  const [scriptTitle, setScriptTitle] = useState('');
  const [scriptStyle, setScriptStyle] = useState('narrative storytelling');
  const [scriptType, setScriptType] = useState('long');
  const [scriptDuration, setScriptDuration] = useState('8-10 minutes');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<{
    estimatedDuration: string;
    hook: string;
    sections: Array<{
      chapterTitle: string;
      scriptOutline: string;
      visualAesthetics: string;
      bRollSuggestions?: Array<{
        prompt: string;
        reason: string;
      }>;
    }>;
    outro: string;
  } | null>(null);

  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);

  const copyPrompt = (prompt: string, id: string) => {
    navigator.clipboard.writeText(prompt);
    setCopiedPromptId(id);
    setTimeout(() => setCopiedPromptId(null), 2000);
  };

  // Teleprompter State
  const [isTeleprompterOpen, setIsTeleprompterOpen] = useState(false);
  const [teleprompterSpeed, setTeleprompterSpeed] = useState(1);
  const [isTeleprompterPlaying, setIsTeleprompterPlaying] = useState(false);
  const teleprompterRef = useRef<HTMLDivElement>(null);
  const exactScrollRef = useRef(0);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Teleprompter scroll effect
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const scrollStep = (time: number) => {
      if (isTeleprompterPlaying && teleprompterRef.current) {
        const delta = Math.min(time - lastTime, 50);
        // pixels per second (speed 1 = ~40px/s)
        const scrollAmount = (40 * teleprompterSpeed * delta) / 1000;
        
        exactScrollRef.current += scrollAmount;
        teleprompterRef.current.scrollTop = exactScrollRef.current;
        
        if (Math.abs(teleprompterRef.current.scrollTop - exactScrollRef.current) > 2) {
          exactScrollRef.current = teleprompterRef.current.scrollTop;
        }
      }
      lastTime = time;
      animationFrameId = requestAnimationFrame(scrollStep);
    };

    if (isTeleprompterPlaying) {
      if (teleprompterRef.current) {
        exactScrollRef.current = teleprompterRef.current.scrollTop;
      }
      lastTime = performance.now();
      animationFrameId = requestAnimationFrame(scrollStep);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isTeleprompterPlaying, teleprompterSpeed]);

  // Trigger Video Idea Generator
  const handleGenerateIdeas = async () => {
    setIsGeneratingIdeas(true);
    setErrorMessage(null);
    setGeneratedIdeas([]);
    setSavedIdeaIndices({});

    try {
      const res = await authedFetch('/api/generate-ideas', {
        method: 'POST',
        body: JSON.stringify({ niche, keywords, tone })
      });

      if (!res.ok) {
        throw new Error(await readServerError(res, 'Failed to contact the Gemini Idea generator engine.'));
      }

      const data = await res.json();
      setGeneratedIdeas(data.ideas || []);
    } catch (error: any) {
      setErrorMessage(error.message || "An error occurred during generation.");
    } finally {
      setIsGeneratingIdeas(false);
    }
  };

  // Save Generated Idea as Video Draft
  const handleSaveIdeaAsDraft = async (idea: typeof generatedIdeas[0], index: number) => {
    try {
      await onAddDraftVideo({
        title: idea.title,
        description: `${idea.description}\n\nTarget Audience: ${idea.targetAudience}\nVideo Strategy: ${idea.angle}`,
        category: niche,
        tags: [niche.toLowerCase(), 'tutorial', 'trending']
      });
      setSavedIdeaIndices(prev => ({ ...prev, [index]: true }));
    } catch (err) {
      alert("Failed to save draft.");
    }
  };

  // Trigger SEO copywriter
  const handleGenerateSeo = async () => {
    if (!seoTitle.trim()) return;
    setIsGeneratingSeo(true);
    setErrorMessage(null);
    setGeneratedSeo(null);

    try {
      const res = await authedFetch('/api/generate-seo', {
        method: 'POST',
        body: JSON.stringify({ title: seoTitle, category: seoCategory })
      });

      if (!res.ok) {
        throw new Error(await readServerError(res, 'Failed to contact the Gemini SEO Copywriter.'));
      }

      const data = await res.json();
      setGeneratedSeo(data);
    } catch (error: any) {
      setErrorMessage(error.message || "SEO copy writing failed.");
    } finally {
      setIsGeneratingSeo(false);
    }
  };

  // Trigger Script Writer
  const handleGenerateScript = async () => {
    if (!scriptTitle.trim()) return;
    setIsGeneratingScript(true);
    setErrorMessage(null);
    setGeneratedScript(null);

    try {
      const res = await authedFetch('/api/generate-script', {
        method: 'POST',
        body: JSON.stringify({ 
          title: scriptTitle, 
          style: scriptStyle,
          type: scriptType,
          duration: scriptDuration
        })
      });

      if (!res.ok) {
        throw new Error(await readServerError(res, 'Failed to contact the Gemini Script Architect.'));
      }

      const data = await res.json();
      setGeneratedScript(data);
    } catch (error: any) {
      setErrorMessage(error.message || "Script outline creation failed.");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // Copy to Clipboard helper
  const handleCopyToClipboard = (text: string, field: 'desc' | 'tags') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in" id="ai-assistant-wrapper">
      {/* AI Assistant Nav Header */}
      <div className="flex bg-[#1e1e1e] border border-[#333] rounded-sm p-1.5 gap-2" id="ai-tab-header">
        <button
          onClick={() => { setActiveAssistant('ideas'); setErrorMessage(null); }}
          className={`flex-1 py-3 text-xs font-bold font-sans rounded-sm tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeAssistant === 'ideas'
              ? 'bg-[#3ea6ff] text-[#0f0f0f]'
              : 'hover:bg-[#282828] text-gray-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4" /> Video Idea Generator
        </button>
        <button
          onClick={() => { setActiveAssistant('seo'); setErrorMessage(null); }}
          className={`flex-1 py-3 text-xs font-bold font-sans rounded-sm tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeAssistant === 'seo'
              ? 'bg-[#3ea6ff] text-[#0f0f0f]'
              : 'hover:bg-[#282828] text-gray-400 hover:text-white'
          }`}
        >
          <Search className="w-4 h-4" /> SEO Copywriter
        </button>
        <button
          onClick={() => { setActiveAssistant('script'); setErrorMessage(null); }}
          className={`flex-1 py-3 text-xs font-bold font-sans rounded-sm tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeAssistant === 'script'
              ? 'bg-[#3ea6ff] text-[#0f0f0f]'
              : 'hover:bg-[#282828] text-gray-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-4 h-4" /> AI Script Outliner
        </button>
      </div>

      {/* Error block */}
      {errorMessage && (
        <div className="p-4 bg-red-950/20 border border-red-900/30 text-red-400 text-xs rounded-sm flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
          <p className="font-sans font-medium">{errorMessage}</p>
        </div>
      )}

      {/* 1. Video Idea Generator */}
      {activeAssistant === 'ideas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
          {/* Controls Form (Left - 4/12) */}
          <div className="lg:col-span-4 bg-[#1e1e1e] border border-[#333] rounded-sm p-6 h-fit space-y-4">
            <h3 className="text-sm font-bold font-sans text-white uppercase tracking-wider">Configure Niche Strategy</h3>
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold font-sans text-[#aaa] uppercase tracking-wider">Channel Niche</label>
              <select
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans cursor-pointer"
              >
                <option value="Gaming" className="bg-[#1e1e1e]">Gaming & Esport streams</option>
                <option value="Science & Technology" className="bg-[#1e1e1e]">Tech Reviews & Tutorials</option>
                <option value="Self Improvement" className="bg-[#1e1e1e]">Lifestyle & Productivity</option>
                <option value="Business & Finance" className="bg-[#1e1e1e]">Crypto & Business Analytics</option>
                <option value="Travel" className="bg-[#1e1e1e]">Travel Vlogs & Adventure</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold font-sans text-[#aaa] uppercase tracking-wider">Target Keywords (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Elden Ring, cyber build, RTX 5090"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold font-sans text-[#aaa] uppercase tracking-wider">Audience Hook Style</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans cursor-pointer"
              >
                <option value="Viral/Clickbait" className="bg-[#1e1e1e]">Viral/Clickbait (Curiosity Gaps)</option>
                <option value="Informative & Helpful" className="bg-[#1e1e1e]">Educational & Scientific (Direct)</option>
                <option value="Behind the scenes Storytelling" className="bg-[#1e1e1e]">Emotional Storytelling (Warm)</option>
                <option value="Humorous challenge" className="bg-[#1e1e1e]">Energetic & Funny (Action)</option>
              </select>
            </div>

            <button
              onClick={handleGenerateIdeas}
              disabled={isGeneratingIdeas}
              className="w-full py-3 bg-[#3ea6ff] hover:opacity-90 disabled:bg-zinc-800 text-[#0f0f0f] text-xs font-bold font-sans rounded-sm tracking-wider uppercase transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isGeneratingIdeas ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing Trends...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate 5 Viral Ideas
                </>
              )}
            </button>
          </div>

          {/* Results Area (Right - 8/12) */}
          <div className="lg:col-span-8 space-y-4">
            {generatedIdeas.length > 0 ? (
              generatedIdeas.map((idea, index) => (
                <div key={index} className="bg-[#1e1e1e] border border-[#333] rounded-sm p-5 space-y-4 hover:border-[#444] transition-all text-left">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-[9px] bg-red-950 border border-red-900/30 text-red-400 px-1.5 py-0.5 rounded-sm font-mono font-semibold uppercase tracking-wider">
                        CTR potential: {idea.ctrStrength}
                      </span>
                      <h4 className="text-xs font-bold font-sans text-white mt-1 leading-snug">{idea.title}</h4>
                    </div>

                    <button
                      onClick={() => handleSaveIdeaAsDraft(idea, index)}
                      disabled={savedIdeaIndices[index]}
                      className={`px-3 py-1.5 rounded-sm text-[10px] font-bold font-sans flex items-center gap-1 transition-all cursor-pointer ${
                        savedIdeaIndices[index]
                          ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/25'
                          : 'bg-[#282828] hover:bg-[#1e1e1e] text-gray-300 hover:text-white border border-[#333]'
                      }`}
                    >
                      {savedIdeaIndices[index] ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Saved Draft
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" /> Save to Drafts
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-gray-300 font-sans leading-relaxed">{idea.description}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3 border-t border-[#333] text-[10px] font-mono text-gray-500">
                    <div>
                      <span className="uppercase text-gray-500 text-[9px] block">Psychology Hook</span>
                      <span className="text-gray-300 font-semibold">{idea.angle}</span>
                    </div>
                    <div>
                      <span className="uppercase text-gray-500 text-[9px] block">Target Audience</span>
                      <span className="text-gray-300 font-semibold">{idea.targetAudience}</span>
                    </div>
                    <div>
                      <span className="uppercase text-gray-500 text-[9px] block">Prod Difficulty</span>
                      <span className="text-gray-300 font-semibold">{idea.difficulty}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-[#1e1e1e] border border-[#333] rounded-sm p-12 text-center flex flex-col items-center justify-center">
                <Sparkles className="w-8 h-8 text-gray-500 mb-2" />
                <h4 className="text-xs font-bold font-sans text-white">Gemini Idea Hub is Ready</h4>
                <p className="text-[11px] text-gray-400 font-sans mt-1 max-w-sm">
                  Configure your channel niche, add trending keywords, and click Generate. We will brainstorm highly clickable titles and conceptual descriptions!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. SEO Copywriter */}
      {activeAssistant === 'seo' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
          {/* Controls Form (Left - 4/12) */}
          <div className="lg:col-span-4 bg-[#1e1e1e] border border-[#333] rounded-sm p-6 h-fit space-y-4">
            <h3 className="text-sm font-bold font-sans text-white uppercase tracking-wider">Metadata Configuration</h3>

            <div className="space-y-1">
              <label className="text-[10px] font-bold font-sans text-[#aaa] uppercase tracking-wider">Working Video Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Building a custom gaming PC in my room"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold font-sans text-[#aaa] uppercase tracking-wider">Video Category</label>
              <select
                value={seoCategory}
                onChange={(e) => setSeoCategory(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans cursor-pointer"
              >
                <option value="Gaming" className="bg-[#1e1e1e]">Gaming</option>
                <option value="Science & Technology" className="bg-[#1e1e1e]">Science & Technology</option>
                <option value="Howto & Style" className="bg-[#1e1e1e]">Howto & Style</option>
                <option value="Education" className="bg-[#1e1e1e]">Education</option>
                <option value="Entertainment" className="bg-[#1e1e1e]">Entertainment</option>
              </select>
            </div>

            <button
              onClick={handleGenerateSeo}
              disabled={isGeneratingSeo || !seoTitle.trim()}
              className="w-full py-3 bg-[#3ea6ff] hover:opacity-90 disabled:bg-zinc-800 text-[#0f0f0f] text-xs font-bold font-sans rounded-sm tracking-wider uppercase transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isGeneratingSeo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Writing Metadata...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Optimize Metadata
                </>
              )}
            </button>
          </div>

          {/* Results Area (Right - 8/12) */}
          <div className="lg:col-span-8 space-y-6">
            {generatedSeo ? (
              <div className="space-y-6 bg-[#1e1e1e] border border-[#333] rounded-sm p-6 text-left">
                
                {/* Alternative high ctr titles */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold font-sans text-gray-400 uppercase tracking-wider">Alternative High CTR Title Pairings</h4>
                  <div className="space-y-2">
                    {generatedSeo.alternativeTitles.map((altTitle, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-[#0f0f0f] border border-[#333] rounded-sm p-3">
                        <span className="text-xs font-bold font-sans text-white">{altTitle}</span>
                        <span className="text-[8px] bg-red-950 border border-red-900/30 text-red-400 px-1.5 py-0.5 rounded-sm font-mono font-bold tracking-wider">OPTION {idx + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Search description */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold font-sans text-gray-400 uppercase tracking-wider">Optimized Search Description Draft</h4>
                    <button
                      onClick={() => handleCopyToClipboard(generatedSeo.optimizedDescription, 'desc')}
                      className="text-[10px] font-sans text-[#3ea6ff] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField === 'desc' ? <Check className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
                      {copiedField === 'desc' ? 'Copied!' : 'Copy Description'}
                    </button>
                  </div>
                  <pre className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm p-4 text-[11px] text-gray-300 font-sans whitespace-pre-wrap leading-relaxed overflow-x-auto text-left">
                    {generatedSeo.optimizedDescription}
                  </pre>
                </div>

                {/* Recommended Search Tags */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold font-sans text-gray-400 uppercase tracking-wider">High-Volume Video Search Tags</h4>
                    <button
                      onClick={() => handleCopyToClipboard(generatedSeo.suggestedTags.join(', '), 'tags')}
                      className="text-[10px] font-sans text-[#3ea6ff] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField === 'tags' ? <Check className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
                      {copiedField === 'tags' ? 'Copied!' : 'Copy Tag List'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-3 bg-[#0f0f0f] border border-[#333] rounded-sm">
                    {generatedSeo.suggestedTags.map((tag, idx) => (
                      <span key={idx} className="px-2 py-1 bg-[#1e1e1e] border border-[#333] text-gray-400 hover:text-white rounded-sm font-mono text-[10px] transition-colors">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="bg-[#1e1e1e] border border-[#333] rounded-sm p-12 text-center flex flex-col items-center justify-center">
                <Search className="w-8 h-8 text-gray-500 mb-2" />
                <h4 className="text-xs font-bold font-sans text-white">Metadata SEO Optimization</h4>
                <p className="text-[11px] text-gray-400 font-sans mt-1 max-w-sm">
                  Write your working video title in the configuration panel, select its category, and click Optimize. We will produce click-magnet titles, search-optimized descriptions with timestamps placeholders, and high-conversion tags!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Script Outline Generator */}
      {activeAssistant === 'script' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
          {/* Controls Form (Left - 4/12) */}
          <div className="lg:col-span-4 bg-[#1e1e1e] border border-[#333] rounded-sm p-6 h-fit space-y-4">
            <h3 className="text-sm font-bold font-sans text-white uppercase tracking-wider">Script Blueprint</h3>

            <div className="space-y-1">
              <label className="text-[10px] font-bold font-sans text-[#aaa] uppercase tracking-wider">Video Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Testing the world's fastest graphics card"
                value={scriptTitle}
                onChange={(e) => setScriptTitle(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold font-sans text-[#aaa] uppercase tracking-wider">Script Style & Flow</label>
              <select
                value={scriptStyle}
                onChange={(e) => setScriptStyle(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans cursor-pointer"
              >
                <option value="high paced retention focused mrbeast style" className="bg-[#1e1e1e]">High Retention / Fast-Paced (Action)</option>
                <option value="calm and extremely informative ali abdaal style" className="bg-[#1e1e1e]">Casual & Informative (Storyteller)</option>
                <option value="cinematic and dramatic tech review style" className="bg-[#1e1e1e]">Cinematic & Tech Detailed (Reviewer)</option>
                <option value="comprehensive tutorial step-by-step" className="bg-[#1e1e1e]">Step-by-Step Educational (How-to)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold font-sans text-[#aaa] uppercase tracking-wider">Format</label>
                <select
                  value={scriptType}
                  onChange={(e) => {
                    setScriptType(e.target.value);
                    if (e.target.value === 'short') setScriptDuration('Under 60 seconds');
                    else setScriptDuration('8-10 minutes');
                  }}
                  className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans cursor-pointer"
                >
                  <option value="long" className="bg-[#1e1e1e]">Long-form Video</option>
                  <option value="short" className="bg-[#1e1e1e]">YouTube Short / Reel</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold font-sans text-[#aaa] uppercase tracking-wider">Target Length</label>
                <select
                  value={scriptDuration}
                  onChange={(e) => setScriptDuration(e.target.value)}
                  className="w-full bg-[#0f0f0f] border border-[#333] rounded-sm px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans cursor-pointer"
                >
                  {scriptType === 'long' ? (
                    <>
                      <option value="3-5 minutes" className="bg-[#1e1e1e]">3-5 minutes</option>
                      <option value="8-10 minutes" className="bg-[#1e1e1e]">8-10 minutes</option>
                      <option value="15-20 minutes" className="bg-[#1e1e1e]">15-20 minutes</option>
                      <option value="20+ minutes" className="bg-[#1e1e1e]">20+ minutes</option>
                    </>
                  ) : (
                    <>
                      <option value="Under 30 seconds" className="bg-[#1e1e1e]">Under 30 seconds</option>
                      <option value="Under 60 seconds" className="bg-[#1e1e1e]">Under 60 seconds</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerateScript}
              disabled={isGeneratingScript || !scriptTitle.trim()}
              className="w-full py-3 bg-[#3ea6ff] hover:opacity-90 disabled:bg-zinc-800 text-[#0f0f0f] text-xs font-bold font-sans rounded-sm tracking-wider uppercase transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isGeneratingScript ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Mapping Storyboard...
                </>
              ) : (
                <>
                  <BookOpen className="w-4 h-4" />
                  Generate Script Draft
                </>
              )}
            </button>
          </div>

          {/* Results Area (Right - 8/12) */}
          <div className="lg:col-span-8 space-y-6">
            {generatedScript ? (
              <div className="space-y-6 bg-[#1e1e1e] border border-[#333] rounded-sm p-6 text-left">
                
                {/* Script details duration */}
                <div className="flex items-center justify-between border-b border-[#333] pb-4">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-gray-500">Target Duration</span>
                    <h3 className="text-sm font-bold font-sans text-white">{generatedScript.estimatedDuration}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setIsTeleprompterOpen(true)}
                      className="px-3 py-1.5 bg-[#3ea6ff] hover:opacity-90 text-[10px] font-bold text-[#0f0f0f] uppercase tracking-wider rounded-sm transition-all font-sans cursor-pointer flex items-center gap-1.5 shadow-lg shadow-[#3ea6ff]/20"
                    >
                      <Maximize className="w-3.5 h-3.5" /> Start Teleprompter
                    </button>
                    <span className="text-[10px] bg-[#3ea6ff]/10 border border-[#3ea6ff]/20 text-[#3ea6ff] px-2 py-0.5 rounded-sm font-mono font-bold uppercase tracking-wider">STORYBOARD READY</span>
                  </div>
                </div>

                {/* Hook (0-30s) */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold font-sans text-red-500 uppercase tracking-wider">Hook Segment (0:00 - 0:30)</h4>
                  <div className="bg-[#0f0f0f] border border-[#333] rounded-sm p-4 text-xs text-gray-200 font-sans leading-relaxed whitespace-pre-wrap text-left">
                    {generatedScript.hook}
                  </div>
                </div>

                {/* Chapters */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold font-sans text-gray-400 uppercase tracking-wider">Chapters & Narrative Flow</h4>
                  <div className="space-y-3">
                    {generatedScript.sections.map((sec, idx) => (
                      <div key={idx} className="bg-[#0f0f0f] border border-[#333] rounded-sm overflow-hidden text-left">
                        <div className="bg-[#1e1e1e] px-4 py-2 border-b border-[#333] flex items-center gap-2">
                          <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold font-sans bg-[#0f0f0f] border border-[#333] text-white rounded-sm">{idx + 1}</span>
                          <span className="text-xs font-bold font-sans text-white">{sec.chapterTitle}</span>
                        </div>
                        <div className="p-4 space-y-3">
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-mono tracking-wider text-gray-500 block">Dialogue Outline / Main points</span>
                            <p className="text-xs text-gray-300 font-sans leading-relaxed">{sec.scriptOutline}</p>
                          </div>
                          <div className="p-2.5 bg-[#1e1e1e] border border-[#333] rounded-sm">
                            <span className="text-[9px] uppercase font-mono tracking-wider text-[#3ea6ff] block font-bold flex items-center gap-1">
                              <Layers className="w-3 h-3" /> Visual Aesthetics & B-Roll
                            </span>
                            <p className="text-[11px] text-gray-400 font-sans leading-relaxed mt-0.5 italic">{sec.visualAesthetics}</p>
                            
                            {sec.bRollSuggestions && sec.bRollSuggestions.length > 0 && (
                              <div className="mt-3 space-y-2 border-t border-[#333] pt-2">
                                <span className="text-[9px] uppercase font-mono tracking-wider text-amber-500 block font-bold flex items-center gap-1">
                                  <VideoIcon className="w-3 h-3" /> AI Video Prompts (Luma/Kling)
                                </span>
                                {sec.bRollSuggestions.map((bRoll, bIdx) => (
                                  <div key={bIdx} className="bg-[#0f0f0f] border border-[#444] rounded-sm p-2 flex flex-col gap-2 relative group hover:border-[#3ea6ff]/50 transition-colors">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-[10px] text-gray-300 font-mono leading-relaxed flex-1 whitespace-pre-wrap">"{bRoll.prompt}"</p>
                                      <button 
                                        onClick={() => copyPrompt(bRoll.prompt, `${idx}-${bIdx}`)}
                                        className="text-gray-400 hover:text-white transition-colors cursor-pointer flex-shrink-0"
                                        title="Copy Prompt for Luma/Kling"
                                      >
                                        {copiedPromptId === `${idx}-${bIdx}` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>
                                    <p className="text-[9px] text-gray-500 font-sans italic">Reason: {bRoll.reason}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Outro */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold font-sans text-red-500 uppercase tracking-wider">Call to Action & Outro</h4>
                  <div className="bg-[#0f0f0f] border border-[#333] rounded-sm p-4 text-xs text-gray-200 font-sans leading-relaxed whitespace-pre-wrap text-left">
                    {generatedScript.outro}
                  </div>
                </div>

                {/* Script "Drop-Off" Heatmap (Feature 4) */}
                <div className="pt-4 border-t border-[#333] space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold font-sans text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Retention Heatmap Prediction
                    </h4>
                  </div>
                  <div className="relative h-4 rounded-full flex">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 relative group rounded-l-full" style={{ width: '15%' }}>
                      <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"></div>
                      <div className="absolute bottom-full mb-2 left-0 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10 font-sans flex flex-col">
                        <span className="font-bold">The Hook</span>
                        <span className="text-[9px] text-gray-400"><span className="font-bold text-emerald-400">Green:</span> High Retention</span>
                      </div>
                    </div>
                    {generatedScript.sections.map((sec, idx) => {
                      const width = 75 / generatedScript.sections.length;
                      const stateInfo = [
                        { color: 'bg-amber-400', name: 'Yellow', meaning: 'Core Content (Stable)' },
                        { color: 'bg-orange-400', name: 'Light Orange', meaning: 'Early Fatigue' },
                        { color: 'bg-orange-500', name: 'Dark Orange', meaning: 'High Drop-off Risk' },
                        { color: 'bg-red-400', name: 'Red', meaning: 'Severe Drop-off Risk' }
                      ];
                      const info = stateInfo[Math.min(idx, stateInfo.length - 1)];
                      
                      return (
                        <div key={idx} className={`h-full ${info.color} relative group border-l border-black/20`} style={{ width: `${width}%` }}>
                          <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"></div>
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10 font-sans flex flex-col items-center">
                            <span className="font-bold">{sec.chapterTitle}</span>
                            <span className="text-[9px] text-gray-400"><span className="font-bold text-white">{info.name}:</span> {info.meaning}</span>
                          </div>
                        </div>
                      );
                    })}
                    <div className="h-full bg-gradient-to-r from-red-500 to-red-600 relative group border-l border-black/20 rounded-r-full" style={{ width: '10%' }}>
                      <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"></div>
                      <div className="absolute bottom-full mb-2 right-0 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10 font-sans flex flex-col items-end">
                        <span className="font-bold">Outro & CTA</span>
                        <span className="text-[9px] text-gray-400"><span className="font-bold text-red-400">Red:</span> Severe Drop-off Risk</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-500 font-sans">AI predicts strong retention during your hook. Consider adding b-roll or pacing changes during the orange/red sections to retain viewers.</p>
                </div>

              </div>
            ) : (
              <div className="bg-[#1e1e1e] border border-[#333] rounded-sm p-12 text-center flex flex-col items-center justify-center">
                <BookOpen className="w-8 h-8 text-gray-500 mb-2" />
                <h4 className="text-xs font-bold font-sans text-white">Full Video Script Writer</h4>
                <p className="text-[11px] text-gray-400 font-sans mt-1 max-w-sm">
                  Provide your video's central concept/title, select a storytelling pace or flow style, and click Generate. We will draft an incredibly detailed storyboard script with cues!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Zen Mode Teleprompter Overlay (Feature 6) */}
      {isTeleprompterOpen && generatedScript && (
        <div className="fixed inset-0 z-50 bg-[#0f0f0f] flex flex-col font-sans animate-in fade-in duration-300">
          {/* Header Controls */}
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[#333] bg-[#1a1a1a]/80 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <button onClick={() => setIsTeleprompterOpen(false)} className="p-2 bg-[#282828] hover:bg-[#333] rounded-sm text-gray-400 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Zen Mode Teleprompter</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-[#282828] p-1 rounded-sm border border-[#333]">
                <button onClick={() => setTeleprompterSpeed(s => Math.max(0.5, s - 0.5))} className="p-1.5 hover:bg-[#3ea6ff]/20 hover:text-[#3ea6ff] rounded-sm text-gray-400 transition-colors cursor-pointer">
                  <Rewind className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono font-bold text-white w-8 text-center">{teleprompterSpeed}x</span>
                <button onClick={() => setTeleprompterSpeed(s => Math.min(5, s + 0.5))} className="p-1.5 hover:bg-[#3ea6ff]/20 hover:text-[#3ea6ff] rounded-sm text-gray-400 transition-colors cursor-pointer">
                  <FastForward className="w-4 h-4" />
                </button>
              </div>
              <button 
                onClick={() => setIsTeleprompterPlaying(!isTeleprompterPlaying)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-sm font-bold text-xs uppercase tracking-wider transition-colors shadow-lg cursor-pointer ${
                  isTeleprompterPlaying ? 'bg-amber-500 text-black shadow-amber-500/20' : 'bg-[#3ea6ff] text-black shadow-[#3ea6ff]/20'
                }`}
              >
                {isTeleprompterPlaying ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Start</>}
              </button>
            </div>
          </div>
          
          {/* Main scroll area */}
          <div className="flex-1 relative overflow-hidden">
            {/* Focal Point Indicator (Center Line) */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-48 pointer-events-none z-10 flex items-center">
              <div className="w-16 h-full bg-gradient-to-r from-[#3ea6ff]/10 to-transparent"></div>
              <div className="w-1 h-full bg-gradient-to-b from-transparent via-[#3ea6ff]/50 to-transparent"></div>
            </div>

            <div 
              ref={teleprompterRef}
              className="absolute inset-0 overflow-y-auto px-4 sm:px-12 md:px-32 lg:px-64 pb-[50vh] pt-[40vh]"
            >
              <div className="max-w-4xl mx-auto space-y-12 pb-32">
                <div className="space-y-4">
                  <h3 className="text-3xl font-black text-red-500 uppercase tracking-widest opacity-60">Hook (0:00 - 0:30)</h3>
                  <p className="text-4xl md:text-5xl lg:text-6xl text-white font-semibold leading-[1.4] tracking-tight">{generatedScript.hook}</p>
                </div>

                {generatedScript.sections.map((sec, idx) => (
                  <div key={idx} className="space-y-4">
                    <h3 className="text-3xl font-black text-[#3ea6ff] uppercase tracking-widest opacity-60">Chapter {idx + 1}: {sec.chapterTitle}</h3>
                    <p className="text-4xl md:text-5xl lg:text-6xl text-white font-semibold leading-[1.4] tracking-tight">{sec.scriptOutline}</p>
                    <p className="text-2xl text-emerald-400/80 font-mono italic mt-6 border-l-4 border-emerald-500/50 pl-4 bg-emerald-500/10 py-2">
                      [ VISUAL: {sec.visualAesthetics} ]
                    </p>
                  </div>
                ))}

                <div className="space-y-4">
                  <h3 className="text-3xl font-black text-amber-500 uppercase tracking-widest opacity-60">Call to Action & Outro</h3>
                  <p className="text-4xl md:text-5xl lg:text-6xl text-white font-semibold leading-[1.4] tracking-tight">{generatedScript.outro}</p>
                </div>
              </div>
            </div>
            
            {/* Edge fades */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#0f0f0f] to-transparent pointer-events-none z-10"></div>
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0f0f0f] to-transparent pointer-events-none z-10"></div>
          </div>
        </div>
      )}
    </div>
  );
}
