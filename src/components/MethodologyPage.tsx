import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { getAIConfig, type AIConfigResponse } from '../utils/aiProvider';

export default function MethodologyPage() {
  const navigate = useNavigate();
  const [aiConfig, setAiConfig] = useState<AIConfigResponse | null>(null);

  useEffect(() => {
    getAIConfig()
      .then(config => setAiConfig(config))
      .catch(err => {
        // Non-fatal: disclosure text degrades to static copy.
        console.warn('[MethodologyPage] Could not load AI config.', err);
      });
  }, []);

  // ---------------------------------------------------------------------------
  // Disclosure helpers — derive plain-English text from runtime config
  // ---------------------------------------------------------------------------

  function groundedDisclosure(): string {
    return (
      'Both the intelligence feed and the research chat run on Google\'s Gemini ' +
      '(2.5 Pro), via the app\'s server-side AI layer (Firebase Cloud Functions). ' +
      'These features require a Gemini API key in the current version. The server-side layer does not store queries ' +
      'beyond the duration of a single request.'
    );
  }

  // Display-only label for known Gemini model ids, so the briefing line reads
  // the same friendly form as the grounded line ('2.5 Pro') without losing the
  // runtime fact. Any unrecognised id (a non-Gemini or third-party model) is
  // shown verbatim, so the disclosure can never mislabel what is actually wired.
  function modelLabel(id: string): string {
    const known: Record<string, string> = {
      'gemini-2.5-pro': '2.5 Pro',
      'gemini-2.5-flash': '2.5 Flash',
    };
    return known[id] ?? id;
  }

  function generationDisclosure(): string {
    if (!aiConfig) {
      // Fallback while config loads or if the callable is unavailable.
      return (
        'Briefing generation sends your saved chat content to the operator-selected ' +
        'AI provider via the server-side AI layer. No content is stored beyond the ' +
        'duration of a single request.'
      );
    }

    const { generationProviderId, generationModelPro, failoverEnabled, fallbackProviderIds } = aiConfig;

    const providerLabel =
      generationProviderId === 'gemini'
        ? `Google's Gemini (${modelLabel(generationModelPro)})`
        : `the operator-selected provider (${generationProviderId}, model: ${generationModelPro})`;

    const failoverNote = failoverEnabled && fallbackProviderIds.length > 0
      ? ` If that provider is temporarily unavailable, the request may be retried on a ` +
        `configured fallback (${fallbackProviderIds.join(', ')}).`
      : '';

    return (
      `Briefing generation sends your saved chat content to ${providerLabel} via the ` +
      `server-side AI layer (Firebase Cloud Functions). No content is stored by that ` +
      `layer beyond the duration of a single request.${failoverNote}`
    );
  }

  function operatorResponsibilityNote(): string {
    return (
      'Operators who deploy this application are responsible for selecting a provider ' +
      'that does not train on input data and meets applicable data-residency requirements — ' +
      'a paid no-training API tier or a self-hosted model. Consumer tiers and plans that ' +
      'train on input data are not suitable for client matter content.'
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-wash flex items-center justify-center text-burgundy">
          <Scale size={20} />
        </div>
        <h2 className="font-serif text-3xl font-medium text-ink">Methodology & Provenance</h2>
      </div>

      <div className="space-y-8 text-ink">
        <section className="space-y-6">
          <div>
            <h3 className="font-serif text-xl font-medium text-ink mb-4">I. How the Intelligence Feed Works</h3>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              The Arbitration Briefings maintains a curated intelligence feed of significant developments in international commercial and investment arbitration. An AI engine sweeps open-access legal repositories — court registries, institutional case databases, treaty archives, and legal information institutes — to generate the feed.
            </p>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              The engine draws only from an approved registry of sources. This registry currently comprises over 60 open-access repositories across eight categories: arbitral institutions, case databases, national courts, national legislation, international courts and tribunals, legal information institutes, treaty and policy repositories, and professional bodies and scholarship archives.
            </p>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              Each development card on the home page displays a title, category, date, and a summary written in forensic style. Where the source URL has been verified against the approved registry, the card offers a direct link to the primary document. Each card is tagged with a legal category for at-a-glance classification. Clicking a card opens a research chat where the AI provides deeper analysis.
            </p>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              Before a source link is displayed, the app's server-side layer attempts to confirm that the address is reachable, fetching only the AI-produced public source address — no case facts, chat content, prompts, or workspace data are transmitted to the source site.
            </p>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              A number of the repositories in the registry refuse automated requests of this kind, or do not answer them. Where a source will not permit the check, the link is still shown rather than withheld: suppressing it would hide sound citations far more often than unsound ones. Such a link has been checked against the approved registry and for a well-formed address, but it has not been confirmed to lead to a page that exists. The platform does not distinguish these links from checked ones on the card itself, so treat the presence of a link as an invitation to verify rather than as confirmation.
            </p>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              The intelligence feed is refreshed periodically. Development cards appear in order of recency: the twelve most recent active developments appear on the main feed, and older cards move to the historical ledger where they remain available for browsing. Cards do not expire automatically — they remain in your feed until you dismiss them.
            </p>
          </div>

          <div>
            <h3 className="font-serif text-xl font-medium text-ink mb-4">II. The Research Chat</h3>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              When you ask a question, the AI performs a live search across the approved source registry and the open web, then synthesises a response grounded in verifiable primary texts. The engine prioritises court judgments, arbitral awards, and official institutional publications over secondary commentary.
            </p>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              Every substantive response includes citations alongside the relevant assertions, and concludes with a compulsory 'Sources Consulted' section listing the open-access materials used. Where a verified URL exists, the card provides a clickable link. Where the AI cannot verify the exact URL, the source appears as plain text.
            </p>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              The engine is forbidden from constructing or guessing URLs, and from presenting unverified claims as established legal positions. If the open-access record does not contain the information you need, the engine will say so rather than fabricating an answer.
            </p>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              {groundedDisclosure()}
            </p>
          </div>

          <div>
            <h3 className="font-serif text-xl font-medium text-ink mb-4">III. The Bridge Protocol</h3>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              International arbitration research frequently encounters paywalled sources — subscription databases such as Jus Mundi, Kluwer Arbitration, and Global Arbitration Review. When the AI identifies a development reported on a paywalled platform, it does not access or reproduce that content. Instead, it uses the case name or citation to search for the primary text on an approved open-access repository.
            </p>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              If the information is exclusively available behind a paywall, the engine states this clearly and directs you to the relevant subscription service. It may reference publicly accessible portions of commercial platforms (such as open case summaries or news alerts) but will not synthesise paywalled content.
            </p>
          </div>

          <div>
            <h3 className="font-serif text-xl font-medium text-ink mb-4">IV. Briefing Generation</h3>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              You can generate a formal, structured legal report from one or more chats. Generating a briefing strips the back-and-forth of the research chat and consolidates the analysis into a thematically organised report with an executive summary, thematic sections, and a sources consulted list.
            </p>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              You can save generated briefings to your archive, export them as PDF, and edit their titles before saving. Each briefing traces back to its source chat or chats.
            </p>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              {generationDisclosure()}
            </p>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              {operatorResponsibilityNote()}
            </p>
          </div>

          <div>
            <h3 className="font-serif text-xl font-medium text-ink mb-4">V. The Private Workspace & Archive</h3>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              The Arbitration Briefings includes a private archive for organising your research. The archive maintains two sections:
            </p>
            <ul className="list-disc pl-5 font-sans text-sm leading-relaxed text-ink-soft space-y-2">
              <li><strong className="font-semibold text-ink">My Saved Briefings</strong> — formal, structured legal reports that you have generated and saved. Briefings are grouped by category and each one traces back to the source chat or chats that produced it.</li>
              <li><strong className="font-semibold text-ink">My Saved Chats</strong> — your chats, preserved for later review. You can restore saved chats to active status, and if you generated a briefing from a chat, you can navigate directly to the briefing from the archive.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-serif text-xl font-medium text-ink mb-4">VI. Limitations and Responsible Use</h3>
            <p className="font-sans text-sm leading-relaxed text-ink-soft mb-4">
              The Arbitration Briefings uses artificial intelligence and is subject to its inherent limitations.
            </p>
            <ul className="list-disc pl-5 font-sans text-sm leading-relaxed text-ink-soft space-y-2">
              <li>The AI may produce inaccurate information despite the accuracy safeguards. All outputs should be independently verified against primary sources before reliance in any professional context.</li>
              <li>Source links are checked for reachability before display, but only where the source permits the check. A number of repositories refuse automated requests, and their links are shown without having been checked; others serve a page that appears accessible but lacks the expected content. The platform detects neither case reliably, and does not mark the affected links. Every link should be independently verified before reliance.</li>
              <li>The system cannot access paywalled databases. Developments that have not yet been published on open-access repositories will not appear in the intelligence feed or research responses.</li>
              <li>The AI's knowledge has a fixed cut-off date. Live search compensates for recent developments, but very recent events not yet indexed by search engines may fall outside its knowledge.</li>
              <li>This platform is a research tool, not legal advice. It does not replace the judgment of qualified legal counsel.</li>
            </ul>
          </div>
        </section>

        <div className="pt-8 border-t border-border">
          <button
            onClick={() => navigate('/workspace')}
            className="text-[10px] font-bold uppercase tracking-widest text-burgundy hover:underline"
          >
            RETURN HOME
          </button>
        </div>
      </div>
    </div>
  );
}
