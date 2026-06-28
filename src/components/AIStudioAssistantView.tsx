import React, { useState } from 'react';
import { 
  Sparkles, Loader2, ArrowRight, Save, Clipboard, Check, Play, 
  BookOpen, Video as VideoIcon, Search, HelpCircle, Layers 
} from 'lucide-react';
import { Video } from '../types';

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
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<{
    estimatedDuration: string;
    hook: string;
    sections: Array<{
      chapterTitle: string;
      scriptOutline: string;
      visualAesthetics: string;
    }>;
    outro: string;
  } | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Trigger Video Idea Generator
  const handleGenerateIdeas = async () => {
    setIsGeneratingIdeas(true);
    setErrorMessage(null);
    setGeneratedIdeas([]);
    setSavedIdeaIndices({});

    try {
      const res = await fetch('/api/generate-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, keywords, tone })
      });

      if (!res.ok) {
        throw new Error("Failed to contact the Gemini Idea generator engine.");
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
      const res = await fetch('/api/generate-seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: seoTitle, category: seoCategory })
      });

      if (!res.ok) {
        throw new Error("Failed to contact the Gemini SEO Copywriter.");
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
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: scriptTitle, style: scriptStyle })
      });

      if (!res.ok) {
        throw new Error("Failed to contact the Gemini Script Architect.");
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
                  <span className="text-[10px] bg-[#3ea6ff]/10 border border-[#3ea6ff]/20 text-[#3ea6ff] px-2 py-0.5 rounded-sm font-mono font-bold uppercase tracking-wider">STORYBOARD READY</span>
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

    </div>
  );
}
