import React, { useRef, useState } from 'react';
import { FileText, Download, X, Scale, Edit2, Check } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface GeneratedBriefingViewProps {
  content: string;
  defaultTitle: string;
  category: string;
  onClose: () => void;
  onSaveBriefing: (title: string, content: string) => Promise<void>;
}

export const GeneratedBriefingView: React.FC<GeneratedBriefingViewProps> = ({ content, defaultTitle, category, onClose, onSaveBriefing }) => {
  const currentDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const documentRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveAsPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to export the PDF.');
      return;
    }

    const escapeHtml = (text: string) =>
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const htmlContent = documentRef.current?.innerHTML;
    const styles = Array.from(document.styleSheets)
      .map(styleSheet => {
        try {
          return Array.from(styleSheet.cssRules)
            .map(rule => rule.cssText)
            .join('');
        } catch (e) {
          return '';
        }
      })
      .join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtml(title)} - ${currentDate}</title>
          <style>
            ${styles}
            @media print {
              @page { margin: 0; size: a4; }
              body { background: white; padding: 20mm; }
              .no-print { display: none !important; }
            }
            body { 
              font-family: 'serif'; 
              padding: 40px; 
              background: white;
              color: #1a1a1a;
            }
            .max-w-3xl { max-width: 100% !important; }
            .border { border: none !important; }
            .p-8, .md\\:p-16 { padding: 0 !important; }
          </style>
        </head>
        <body>
          <div class="max-w-3xl mx-auto">
            ${htmlContent}
          </div>
          <div style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center;">
            <p style="font-family: 'Inter', sans-serif; font-size: 10px; color: #737373; text-transform: uppercase; letter-spacing: 1px; line-height: 1.6;">
              The Arbitration Briefings utilises artificial intelligence. Please verify all outputs against primary source texts.
            </p>
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSaveToArchive = async () => {
    if (isSaved || isSaving) return;
    setIsSaving(true);
    try {
      await onSaveBriefing(title, content);
      setIsSaved(true);
    } catch (error) {
      console.error("Failed to save briefing:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-8 no-print-bg briefing-modal-container">
      <div className="bg-white w-full max-w-5xl h-full max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 print:shadow-none print:max-h-none print:h-auto print:rounded-none">
        {/* Toolbar */}
        <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-paper-bright no-print">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-burgundy flex items-center justify-center text-white">
              <Scale size={16} />
            </div>
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="font-serif text-lg font-semibold text-ink border-b border-burgundy focus:outline-none bg-transparent px-1"
                  autoFocus
                  onBlur={() => setIsEditingTitle(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
                />
                <button onClick={() => setIsEditingTitle(false)} className="text-burgundy">
                  <Check size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingTitle(true)}>
                <h2 className="font-serif text-lg font-semibold text-ink">{title}</h2>
                <Edit2 size={14} className="text-gray-400 group-hover:text-burgundy transition-colors" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveToArchive}
              disabled={isSaved || isSaving}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm font-medium shadow-sm ${
                isSaved 
                  ? 'border-emerald-600 text-emerald-600 bg-emerald-50' 
                  : 'border-burgundy text-burgundy hover:bg-burgundy hover:text-white'
              }`}
            >
              {isSaved ? <Check size={16} /> : <FileText size={16} />}
              <span>{isSaving ? 'Saving...' : isSaved ? 'Saved to My Archive' : 'Save to My Archive'}</span>
            </button>
            <button
              onClick={handleSaveAsPDF}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-burgundy text-white hover:bg-burgundy-deep transition-colors text-sm font-medium shadow-sm"
            >
              <Download size={16} />
              <span>Save as PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-muted hover:text-ink hover:bg-wash rounded-lg transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Document Content */}
        <div className="flex-1 overflow-y-auto bg-paper-dim p-6 md:p-12 print:overflow-visible print:p-0 print:bg-white">
          <div 
            ref={documentRef}
            id="briefing-document-content" 
            className="max-w-3xl mx-auto bg-white border border-border p-8 md:p-16 font-serif text-ink leading-relaxed w-full print:border-none print:p-0"
          >
            {/* Header */}
            <div className="text-center mb-8 pb-6 border-b border-border">
              <div className="flex items-center justify-center gap-1.5 mb-4 opacity-70">
                <span className="text-[9px] font-sans uppercase tracking-[0.25em] text-slate">A</span>
                <span className="font-serif text-[11px] text-burgundy italic">Lex Arbitri</span>
                <span className="text-[9px] font-sans uppercase tracking-[0.25em] text-slate">Intelligence Tool</span>
              </div>
              <h1 className="text-4xl font-bold uppercase tracking-tight mb-2">{title}</h1>
              <div className="flex justify-between items-end text-xs font-sans font-semibold text-burgundy uppercase tracking-wider mt-6">
                <span>Ref: {isSaved ? 'AB-ARCHIVED' : 'AB-DRAFT'}</span>
                <span>Category: {category}</span>
                <span>Date: {currentDate}</span>
              </div>
            </div>

            {/* Markdown Content */}
            <MarkdownRenderer content={content} />

            {/* Disclaimer */}
            <div className="mt-16 pt-8 border-t border-border text-center no-print">
              <p className="text-[9px] font-sans text-gray-400 uppercase tracking-[0.15em] leading-relaxed max-w-2xl mx-auto">
                The Arbitration Briefings utilises artificial intelligence. Please verify all outputs against primary source texts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
