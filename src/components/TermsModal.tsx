import React from 'react';
import { X, Scale } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Semi-transparent backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal container: Lex Arbitri 'Paper' palette and academic typography */}
      <div className="relative w-full max-w-2xl bg-paper shadow-2xl rounded-sm overflow-hidden animate-in fade-in zoom-in duration-250 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-wash flex items-center justify-center text-burgundy">
              <Scale size={20} />
            </div>
            <h2
              className="text-2xl font-semibold"
              style={{
                fontFamily: '"Cormorant Garamond", serif',
                color: '#8B2C2C',
                letterSpacing: '0.5px'
              }}
            >
              Terms of Use & Legal Disclaimer
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted hover:text-ink transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto custom-scrollbar">
          <div
            className="space-y-6 text-justify text-sm"
            style={{
              fontFamily: '"Inter", sans-serif',
              color: '#1A1A1A',
              lineHeight: 1.6,
              fontSize: '14px',
            }}
          >
            <p>
              The Arbitration Briefings is an AI-assisted legal intelligence platform provided strictly for <strong>informational and research purposes</strong>. The synthesis and extraction generated herein do not constitute formal legal advice, nor does access to this platform establish a solicitor–client or attorney–client relationship.
            </p>
            <p>
              Whilst the platform draws only from verified public registries and arbitral institutions, the underlying artificial intelligence remains capable of error. The system may occasionally produce <strong>inaccurate information</strong> or broken links, owing to the dynamic nature of institutional databases. The human practitioner remains the <strong>final arbiter of accuracy</strong>.
            </p>
            <p>
              By proceeding, you acknowledge that this tool is AI-assisted, accept our Methodology &amp; Provenance, and agree to these Terms of Use &amp; Legal Disclaimer.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-paper border-t border-border flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-burgundy text-white text-xs font-bold uppercase tracking-widest hover:bg-burgundy-deep transition-colors rounded-sm"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
};
