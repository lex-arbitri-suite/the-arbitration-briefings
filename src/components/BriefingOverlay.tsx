import { GeneratedBriefingView } from './GeneratedBriefingView';

interface BriefingOverlayProps {
  isGenerating: boolean;
  content: string | null;
  title: string;
  category: string;
  onClose: () => void;
  onSaveBriefing: (title: string, content: string) => Promise<void>;
}

export default function BriefingOverlay({
  isGenerating,
  content,
  title,
  category,
  onClose,
  onSaveBriefing,
}: BriefingOverlayProps) {
  if (isGenerating) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-burgundy border-t-transparent rounded-full animate-spin"></div>
          <p className="font-serif text-lg font-semibold text-ink">Synthesising Research Briefing...</p>
        </div>
      </div>
    );
  }

  if (content) {
    return (
      <GeneratedBriefingView
        content={content}
        defaultTitle={title}
        category={category}
        onClose={onClose}
        onSaveBriefing={onSaveBriefing}
      />
    );
  }

  return null;
}
