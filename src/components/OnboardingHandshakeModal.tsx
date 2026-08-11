import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';

/** First-visit onboarding modal — presents the platform's terms, methodology, and limitations. Dismissed state is persisted to localStorage by the parent. */
interface OnboardingHandshakeModalProps {
  isVisible: boolean;
  onAcknowledge: () => void;
}

export function OnboardingHandshakeModal({ isVisible, onAcknowledge }: OnboardingHandshakeModalProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-ink/80 backdrop-blur-md"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-paper border border-burgundy/20 shadow-2xl p-8 md:p-10 flex flex-col max-h-[90vh]"
      >
        <div className="w-16 h-16 bg-burgundy rounded-full flex items-center justify-center text-white mx-auto mb-6 shadow-lg flex-shrink-0">
          <ShieldCheck size={32} />
        </div>
        <h2
          className="font-serif text-3xl font-semibold text-ink mb-3 text-center flex-shrink-0"
          style={{ fontFamily: "'Cormorant Garamond', serif", letterSpacing: 0 }}
        >
          The Arbitration Briefings
        </h2>
        <div className="text-left text-sm text-ink-soft leading-relaxed mb-8 font-sans space-y-8 overflow-y-auto pr-2 custom-scrollbar">
          <div>
            <h3 className="font-serif text-xl font-semibold text-ink mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Methodology &amp; Provenance
            </h3>
            <div className="space-y-6">
              <div>
                <h4 className="font-serif text-lg font-semibold text-ink mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  I. Curated Archival Sourcing (Provenance)
                </h4>
                <p>
                  This platform does not rely on generic, unconstrained search engine aggregation. Instead, the engine draws only from a registry of over 60 open-access repositories across eight categories: arbitral institutions, case databases, national courts, national legislation, international courts and tribunals, legal information institutes, treaty and policy repositories, and professional bodies and scholarship archives. Within that registry, the system prioritises verified institutional databases such as italaw, the ICSID Case Database, UNCITRAL CLOUT, and BAILII. Whilst open-access alerts from commercial legal publishers may be synthesised for market context, the core intelligence remains anchored in the public legal record.
                </p>
              </div>
              <div>
                <h4 className="font-serif text-lg font-semibold text-ink mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  II. Constrained Synthesis Engine (Methodology)
                </h4>
                <p className="mb-2">
                  To serve the rigorous demands of international arbitration, the platform operates under strict accuracy controls.
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong className="font-semibold text-ink">Deterministic Output:</strong> The system’s generative variance (temperature) runs at near zero, sharply reducing the risk of fabricated legal facts.
                  </li>
                  <li>
                    <strong className="font-semibold text-ink">Citation Protocol:</strong> The engine uses live search to add citations. It verifies URLs against live search results, though institutional websites change frequently. Treat AI-generated links as navigational aids and independently verify the primary text.
                  </li>
                  <li>
                    <strong className="font-semibold text-ink">The ‘Empty State’ Guardrail:</strong> If the approved repositories do not contain the information you need, the engine states that the information is unavailable rather than fabricating an answer or drawing on unrelated material.
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-serif text-lg font-semibold text-ink mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  III. The Private Workspace &amp; Archive
                </h4>
                <p className="mb-2">
                  For signed-in practitioners, The Arbitration Briefings functions as a private filing system for ongoing research. The Archive holds two sections:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong className="font-semibold text-ink">My Saved Briefings:</strong> formal, structured legal reports, generated and saved for later reference.
                  </li>
                  <li>
                    <strong className="font-semibold text-ink">My Saved Chats:</strong> your research chats, preserved for later review.
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <hr className="my-4 border-border" />
          <div>
            <h3 className="font-serif text-xl font-semibold text-ink mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Terms of Use &amp; Legal Disclaimer
            </h3>
            <p className="mb-4">
              The Arbitration Briefings is an AI-assisted legal intelligence platform provided strictly for informational and research purposes. The synthesis and extraction generated herein do not constitute formal legal advice, nor does access to this platform establish a solicitor–client or attorney–client relationship.
            </p>
            <p className="mb-4">
              Whilst the platform draws only from verified public registries and arbitral institutions, the underlying artificial intelligence remains capable of error. The system may occasionally produce inaccurate information or broken links, owing to the dynamic nature of institutional databases. The human practitioner remains the final arbiter of accuracy.
            </p>
            <p>
              By proceeding to the platform, you acknowledge that this tool is AI-assisted, accept our Methodology &amp; Provenance, and agree to these Terms of Use &amp; Legal Disclaimer.
            </p>
          </div>
        </div>
        <div className="flex-shrink-0 pt-6 border-t border-border">
          <button
            onClick={onAcknowledge}
            className="w-full py-4 bg-burgundy text-white rounded-sm text-xs font-bold uppercase tracking-[0.2em] hover:bg-burgundy-deep transition-all shadow-md active:scale-[0.98]"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Commence Enquiry
          </button>
        </div>
      </motion.div>
    </div>
  );
}
