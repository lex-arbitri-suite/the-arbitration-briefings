/**
 * urlPatterns.ts — URL pattern guidance blocks for AI prompts.
 *
 * SHARED MODULE — used by both browser client and any other consumer
 * that imports from src/prompts/.
 *
 * Note: functions/index.ts cannot import from src/ because functions/
 * is a separate npm package; it must mirror these blocks manually.
 */

export const ACCEPTABLE_URL_EXAMPLES = `ACCEPTABLE URL EXAMPLES (each points to a specific document, not a homepage or listing):

- italaw case page: https://www.italaw.com/cases/2513
- ICSID case detail: https://icsid.worldbank.org/en/Pages/cases/casedetail.aspx?CaseNo=ARB%2F97%2F7
- PCA case page: https://pca-cpa.org/en/cases/1/
- UK Supreme Court case: https://www.supremecourt.uk/cases/uksc-2025-0165
- ICJ case page: https://www.icj-cij.org/case/186
- ECHR judgment via HUDOC: https://hudoc.echr.coe.int/app/conversion/pdf/?library=ECHR&id=003-8507918-12071365
- CJEU judgment via EUR-Lex CELEX: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62016CJ0284
- BAILII case page: https://www.bailii.org/uk/cases/UKSC/2020/48.html
- Find Case Law judgment: https://caselaw.nationalarchives.gov.uk/ewca/civ/2020/574
- CanLII case page (canonical short form): https://canlii.ca/t/g7qt5
- AustLII case page: https://www.austlii.edu.au/au/cases/cth/HCA/2025/29.html
- HKLII case page: https://www.hklii.hk/en/cases/hkca/2025/234
- Hoge Raad judgment via Rechtspraak: https://uitspraken.rechtspraak.nl/details?id=ECLI:NL:HR:2024:375
- Légifrance code article: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000023430167
- UNCTAD Investment Policy Hub article: https://investmentpolicy.unctad.org/news/hub/1793/20260401-update-on-investor-state-arbitrations-400-cases-filed-under-investment-treaties-since-2020`;

export const NOT_ACCEPTABLE_URL_EXAMPLES = `NOT ACCEPTABLE URL EXAMPLES (homepages, listings, search pages, or guessed identifiers):

- https://www.italaw.com/ — bare homepage
- https://icsid.worldbank.org/ — bare homepage
- https://icsid.worldbank.org/cases/case-database — case-database listing, not a specific case
- https://www.bailii.org/uk/cases/UKSC/ — court listing, not a specific case
- https://www.hklii.hk/en/cases/hkca/ — court listing, not a specific case
- https://www.supremecourt.gov/opinions/slipopinion/25 — term index, not an individual opinion
- https://www.italaw.com/cases/99999 — invented case identifier (never construct case IDs that have not been confirmed by a search result)
- https://www.google.com/search?q=Maffezini+v+Spain — search results page is not a primary source`;

export const CANONICAL_URL_PATTERNS = `CANONICAL URL PATTERNS BY SOURCE (recognise these patterns when search returns a candidate URL; if a URL from search does not match the canonical pattern for its domain, treat it as suspect and cite by name only):

Case databases:
- italaw: /cases/{numeric-id} (e.g. /cases/2513)
- ICSID case detail: /en/Pages/cases/casedetail.aspx?CaseNo={URL-encoded case number, e.g. ARB%2F97%2F7}
- PCA: /en/cases/{numeric-id}/

National & supreme courts:
- UK Supreme Court: /cases/{docket-id} (e.g. /cases/uksc-2024-0001)
- Supreme Court of India: /view-pdf/?diary_no={n}&type=j&order_date=YYYY-MM-DD
- IndianKanoon: /doc/{numeric-id}/
- Hoge Raad / Dutch courts via Rechtspraak: /details?id={ECLI, e.g. ECLI:NL:HR:2024:375}

International courts:
- ICJ: /case/{numeric-id}
- ECHR HUDOC: /app/conversion/pdf/?library=ECHR&id={ECHR-document-id}
- CJEU judgments: prefer the EUR-Lex CELEX deep link /legal-content/EN/TXT/?uri=CELEX:{celex-id}

Legal Information Institutes:
- Find Case Law: /{court}/{YYYY}/{N} or /{court}/{division}/{YYYY}/{N} — e.g. /uksc/2021/1, /ukpc/2021/9, /ewca/civ/2020/574, /ewhc/comm/2023/1. Covers England and Wales plus UK-wide Supreme Court and Privy Council. Prefer it over BAILII for those courts: it is the official National Archives service and its links can be checked, whereas BAILII's cannot.
- BAILII: /uk/cases/{COURT}/{YYYY}/{N}.html or /ew/cases/{COURT}/{division}/{YYYY}/{N}.html
- CanLII: short form /t/{stable-short-id} preferred; long form /en/{j}/{court}/doc/{year}/{neutral-cite}/{neutral-cite}.html
- AustLII: /au/cases/{jurisdiction}/{COURT}/{year}/{n}.html
- HKLII: /en/cases/{court}/{year}/{n}
- AfricanLII: /en/akn/{country-code}/judgment/{court}/{year}/{n}/eng@{date}

Legislation & treaties:
- EUR-Lex: /legal-content/{LANG}/TXT/?uri=CELEX:{celex-id}
- Légifrance code articles: /codes/article_lc/LEGIARTI{numeric-id}
- Légifrance code sections: /codes/section_lc/LEGITEXT{numeric-id}/LEGISCTA{numeric-id}/
- Légifrance older laws/decrees: /loda/id/{LEGITEXT-id}/
- UK Legislation: /{type}/{year}/{number} (e.g. /uksi/2024/123)
- Singapore Statutes Online: /Act/{ActId} for primary acts
- UNCTAD Investment Policy Hub: /news/hub/{n}/{YYYYMMDD-slug}
- Trans-Lex: /{numeric-id}`;

export const CITE_BY_NAME_ONLY = `CITE BY NAME ONLY (do not construct or include any URL for these sources — provide source name and case reference as plain text):

- Court of Arbitration for Sport (CAS): jurisprudence.tas-cas.org uses session-bound search
- UNCITRAL CLOUT abstracts: pattern unstable
- Hong Kong Legal Reference System (legalref.judiciary.hk): session-only deep links
- newyorkconvention1958.org: site is JavaScript-only; for the Convention text, link to UNCITRAL's mirror at uncitral.un.org
- All institutional homepages and arbitral institution sites with no stable case-level URL pattern, including: HKIAC, SIAC, ICC, LCIA, AAA-ICDR, SCC, VIAC, CRCICA, WIPO AMC, DIAC, SCCA, DIS, ACICA, CIETAC, IBA, CIArb, SVAMC, IISD, OAS, UAE Ministry of Justice, Singapore Ministry of Law, Hong Kong Judiciary main site`;
