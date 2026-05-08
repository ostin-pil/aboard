import type { ClaimGraph } from "@/lib/types";

const AGENT = {
  agent: "claude-opus-4-7",
  promptTitle: "Seed claim author v0.1",
  generatedAt: "2026-05-08T12:00:00Z",
};

const PRO_AGENT = {
  agent: "claude-opus-4-7",
  promptTitle: "Steelman pro-thesis dossier v0.1",
  generatedAt: "2026-05-08T12:30:00Z",
};

const CON_AGENT = {
  agent: "claude-opus-4-7",
  promptTitle: "Steelman con-thesis dossier v0.1",
  generatedAt: "2026-05-08T12:30:00Z",
};

export const seed: ClaimGraph = {
  claims: [
    {
      id: "S1",
      kind: "symptom",
      title: "Liberal Democracy Index in global decline",
      statement:
        "The aggregate Liberal Democracy Index (V-Dem) has declined across a majority of countries year-over-year for the most recent reporting decade, reversing the post-1990 expansion.",
      domain: "democratic_backsliding",
      confidence: 0.9,
      sources: [
        {
          label: "V-Dem Democracy Report",
          url: "https://v-dem.net/publications/democracy-reports/",
          excerpt:
            "Annual report with country-level Liberal Democracy Index time-series.",
        },
        {
          label: "Freedom in the World",
          url: "https://freedomhouse.org/report/freedom-world",
        },
      ],
      authoredBy: AGENT,
      createdAt: "2026-05-08T12:00:00Z",
    },
    {
      id: "S2",
      kind: "symptom",
      title: "Rising executive aggrandizement",
      statement:
        "V-Dem indicators of executive overreach (legislative constraints, judicial constraints) have weakened in multiple consolidated democracies, indicating systematic erosion of horizontal accountability.",
      domain: "democratic_backsliding",
      confidence: 0.85,
      sources: [
        {
          label: "V-Dem Methodology",
          url: "https://v-dem.net/data/the-v-dem-dataset/",
        },
        {
          label: "EIU Democracy Index",
          url: "https://www.eiu.com/topic/democracy-index",
        },
      ],
      authoredBy: AGENT,
      createdAt: "2026-05-08T12:00:00Z",
    },
    {
      id: "S3",
      kind: "symptom",
      title: "Press freedom declining",
      statement:
        "RSF's World Press Freedom Index shows year-over-year deterioration in the press-freedom environment for a majority of tracked countries, with sharpened decline in the political indicator.",
      domain: "democratic_backsliding",
      confidence: 0.85,
      sources: [
        {
          label: "RSF World Press Freedom Index",
          url: "https://rsf.org/en/index",
        },
      ],
      authoredBy: AGENT,
      createdAt: "2026-05-08T12:00:00Z",
    },
    {
      id: "M1",
      kind: "mechanism",
      title: "Information environment fragmentation",
      statement:
        "The collapse of shared information sources and the rise of partisan-sorted news consumption reduces the common ground required for democratic deliberation, increasing willingness to discount opposing claims as illegitimate.",
      domain: "democratic_backsliding",
      confidence: 0.7,
      sources: [
        {
          label: "Pew Research — News Platform Fact Sheet",
          url: "https://www.pewresearch.org/journalism/fact-sheet/news-platform-fact-sheet/",
        },
        {
          label: "Reuters Digital News Report",
          url: "https://reutersinstitute.politics.ox.ac.uk/digital-news-report",
        },
      ],
      authoredBy: AGENT,
      createdAt: "2026-05-08T12:00:00Z",
    },
    {
      id: "M2",
      kind: "mechanism",
      title: "Affective polarization erodes democratic norms",
      statement:
        "Rising affective polarization — voters identifying with parties as in-groups and out-groups — increases tolerance for anti-democratic behavior by co-partisans, raising the cost of cross-party coalition-building and lowering the cost of norm violations.",
      domain: "democratic_backsliding",
      confidence: 0.8,
      sources: [
        {
          label: "ANES — Feeling Thermometer Series",
          url: "https://electionstudies.org/data-center/",
        },
        {
          label: "Iyengar et al. — affective polarization review",
          url: "https://www.annualreviews.org/doi/10.1146/annurev-polisci-051117-073034",
        },
      ],
      authoredBy: AGENT,
      createdAt: "2026-05-08T12:00:00Z",
    },
    {
      id: "M3",
      kind: "mechanism",
      title: "Economic insecurity drives authoritarian appeal",
      statement:
        "Persistent economic insecurity and stagnating mobility increase the appeal of strongman political brands that promise stability through executive action, raising tolerance for anti-pluralist rhetoric.",
      domain: "democratic_backsliding",
      confidence: 0.6,
      sources: [
        {
          label: "OECD — Economic Insecurity",
          url: "https://www.oecd.org/wise/well-being-data.htm",
        },
        {
          label: "World Inequality Database",
          url: "https://wid.world/",
        },
      ],
      authoredBy: AGENT,
      createdAt: "2026-05-08T12:00:00Z",
    },
    {
      id: "M4",
      kind: "mechanism",
      title: "Platform algorithmic amplification of outrage content",
      statement:
        "Major platforms' engagement-optimized ranking systems disproportionately surface content that triggers anger and out-group hostility, accelerating affective polarization and information fragmentation through repeated exposure to the most divisive subset of public speech.",
      domain: "democratic_backsliding",
      confidence: 0.55,
      sources: [
        {
          label: "Center for Countering Digital Hate research portal",
          url: "https://counterhate.com/research/",
        },
        {
          label: "Stanford Internet Observatory",
          url: "https://cyber.fsi.stanford.edu/io",
        },
      ],
      authoredBy: AGENT,
      createdAt: "2026-05-08T12:00:00Z",
    },
    {
      id: "M5",
      kind: "mechanism",
      title: "Erosion of intermediary civic institutions",
      statement:
        "The decline of cross-class civic intermediaries (unions, congregations, civic associations) removes the venues where citizens of differing politics encountered one another, raising the salience of partisan identity and reducing trust-building exposure.",
      domain: "democratic_backsliding",
      confidence: 0.65,
      sources: [
        {
          label: "Putnam — Bowling Alone (data appendix)",
          url: "https://bowlingalone.com/",
        },
        {
          label: "BLS Union Membership",
          url: "https://www.bls.gov/news.release/union2.toc.htm",
        },
      ],
      authoredBy: AGENT,
      createdAt: "2026-05-08T12:00:00Z",
    },
    {
      id: "L1",
      kind: "leverage_point",
      title: "Electoral system reform (PR / ranked-choice)",
      statement:
        "Shifting from plurality voting to proportional representation or ranked-choice voting reduces the strategic incentive for negative-partisan campaigning, lowering affective polarization at equilibrium.",
      domain: "democratic_backsliding",
      confidence: 0.55,
      sources: [
        {
          label: "FairVote — RCV evidence",
          url: "https://fairvote.org/our-reforms/ranked-choice-voting/",
        },
        {
          label: "ACE Electoral Knowledge Network",
          url: "https://aceproject.org/",
        },
      ],
      authoredBy: AGENT,
      createdAt: "2026-05-08T12:00:00Z",
    },
    {
      id: "L2",
      kind: "leverage_point",
      title: "Public-interest journalism funding",
      statement:
        "Sustained public funding for non-partisan, local-coverage journalism rebuilds shared informational substrate and reduces dependence on engagement-driven national outlets, partially reversing fragmentation.",
      domain: "democratic_backsliding",
      confidence: 0.5,
      sources: [
        {
          label: "Reuters Institute — Public Funding of News",
          url: "https://reutersinstitute.politics.ox.ac.uk/our-research",
        },
      ],
      authoredBy: AGENT,
      createdAt: "2026-05-08T12:00:00Z",
    },
    {
      id: "L3",
      kind: "leverage_point",
      title: "Platform antitrust + algorithmic transparency",
      statement:
        "Antitrust enforcement against dominant platforms combined with mandated algorithmic auditing reduces the leverage of any single ranking system over public discourse and creates contestability for less polarizing alternatives.",
      domain: "democratic_backsliding",
      confidence: 0.45,
      sources: [
        {
          label: "EU Digital Services Act",
          url: "https://digital-strategy.ec.europa.eu/en/policies/digital-services-act-package",
        },
        {
          label: "Stigler Center — Digital Platforms research",
          url: "https://www.chicagobooth.edu/research/stigler",
        },
      ],
      authoredBy: AGENT,
      createdAt: "2026-05-08T12:00:00Z",
    },
    {
      id: "L4",
      kind: "leverage_point",
      title: "Civic education investment",
      statement:
        "Sustained K-12 and adult civic-education programming raises baseline knowledge of democratic procedure and pluralist norms, slowing erosion of intermediary civic life.",
      domain: "democratic_backsliding",
      confidence: 0.4,
      sources: [
        {
          label: "CIRCLE — Tufts Civic Engagement",
          url: "https://circle.tufts.edu/",
        },
      ],
      authoredBy: AGENT,
      createdAt: "2026-05-08T12:00:00Z",
    },
  ],
  edges: [
    { id: "E1", fromId: "M1", toId: "S1", kind: "causes", strength: 0.6 },
    { id: "E2", fromId: "M1", toId: "S3", kind: "causes", strength: 0.55 },
    { id: "E3", fromId: "M2", toId: "S1", kind: "causes", strength: 0.65 },
    { id: "E4", fromId: "M2", toId: "S2", kind: "causes", strength: 0.7 },
    { id: "E5", fromId: "M3", toId: "S2", kind: "causes", strength: 0.5 },
    { id: "E6", fromId: "M4", toId: "M1", kind: "moderates", strength: 0.55 },
    { id: "E7", fromId: "M4", toId: "M2", kind: "moderates", strength: 0.5 },
    { id: "E8", fromId: "M5", toId: "M2", kind: "moderates", strength: 0.55 },
    { id: "E9", fromId: "L1", toId: "M2", kind: "reduces", strength: 0.45 },
    { id: "E10", fromId: "L2", toId: "M1", kind: "reduces", strength: 0.4 },
    { id: "E11", fromId: "L3", toId: "M4", kind: "reduces", strength: 0.4 },
    { id: "E12", fromId: "L4", toId: "M5", kind: "reduces", strength: 0.35 },
  ],
  forecasts: [
    {
      id: "F1",
      attachedToClaimId: "M2",
      question:
        "Will the US ANES out-party feeling-thermometer gap widen relative to the most recent prior wave by the next ANES wave (≤2028)?",
      resolutionDate: "2028-12-31",
      resolutionCriteria:
        "Widening means the absolute difference between in-party and out-party mean feeling-thermometer scores increases by ≥2 points relative to the most recent ANES Time Series Study.",
      predictions: [
        {
          agent: AGENT,
          probability: 0.72,
          reasoning:
            "Decadal trend has been monotonic upward since the 1990s; absent a major shock to the party system or a sustained electoral-reform rollout (none currently active at scale), continuation is base-rate. Downside risk: measurement-mode effects in next wave.",
          createdAt: "2026-05-08T12:30:00Z",
        },
      ],
    },
    {
      id: "F2",
      attachedToClaimId: "M3",
      question:
        "Will the OECD economic-insecurity composite worsen for a majority of OECD countries between 2025 and 2028?",
      resolutionDate: "2028-12-31",
      resolutionCriteria:
        "Worsening means the OECD's published economic-insecurity composite (or successor index in the WISE framework) shows year-over-year deterioration in ≥50% of OECD member countries when 2028 data are released.",
      predictions: [
        {
          agent: AGENT,
          probability: 0.55,
          reasoning:
            "Mixed signals: real-wage recovery in some economies offsets housing-cost and pension-shortfall worsening in others. Base-rate uncertain; weighting toward 'majority worsen' because pension and housing components show structural deterioration.",
          createdAt: "2026-05-08T12:30:00Z",
        },
      ],
    },
    {
      id: "F3",
      attachedToClaimId: "M1",
      question:
        "Will the US news-source HHI (concentration index across major outlets) decrease (more fragmented) by end-2027 vs. end-2024?",
      resolutionDate: "2027-12-31",
      resolutionCriteria:
        "Using Reuters Digital News Report's source-share data, HHI computed across the top 15 outlets falls relative to the 2024 baseline.",
      predictions: [
        {
          agent: AGENT,
          probability: 0.62,
          reasoning:
            "Continued attrition of legacy outlets and rise of independent / podcast / Substack alternatives points toward further fragmentation, but TikTok and YouTube concentration may offset.",
          createdAt: "2026-05-08T12:30:00Z",
        },
      ],
    },
    {
      id: "F4",
      attachedToClaimId: "M4",
      question:
        "Will at least one major platform (Meta family, X, TikTok, YouTube) publicly publish algorithmic-ranking parameters or detailed audits by 2027?",
      resolutionDate: "2027-12-31",
      resolutionCriteria:
        "A first-party publication (not third-party leak) describing ranking signals at a level enabling independent reproducibility for at least one major surface (feed, recommendations).",
      predictions: [
        {
          agent: AGENT,
          probability: 0.35,
          reasoning:
            "DSA pressure increases probability over baseline but firms have so far complied with minimum disclosure; full reproducibility-grade publication is a meaningful step beyond current practice.",
          createdAt: "2026-05-08T12:30:00Z",
        },
      ],
    },
    {
      id: "F5",
      attachedToClaimId: "L3",
      question:
        "Will any G7 country pass binding algorithmic-transparency legislation by end-2027 (beyond DSA scope)?",
      resolutionDate: "2027-12-31",
      resolutionCriteria:
        "Binding statute requiring documented algorithmic auditing or ranking disclosure, distinct from DSA requirements (which apply to EU members already).",
      predictions: [
        {
          agent: AGENT,
          probability: 0.3,
          reasoning:
            "UK Online Safety Act and Canadian C-27 are partial precedents but stop short of mandatory ranking disclosure; political appetite is uneven.",
          createdAt: "2026-05-08T12:30:00Z",
        },
      ],
    },
  ],
  dossiers: [
    {
      attachedToClaimId: "M4",
      pro: {
        thesis:
          "Platform algorithmic amplification of outrage is a primary causal driver of contemporary affective polarization and information fragmentation, not a marginal contributor.",
        steelmannedSummary:
          "Engagement-ranked feeds systematically over-represent content that produces strong emotional response, and out-group anger is the most reliable producer of such response. Repeated exposure across hundreds of millions of users compounds: behavioral-economics and habit-formation evidence indicates that ranking effects are persistent rather than transient. Internal Meta research (Facebook Files) and audit studies (Bakshy, Bail) show measurable shifts in attitudes after feed-level interventions. Cross-country variance in polarization tracks platform-usage variance with a temporal lag consistent with causation rather than mere selection. The counterfactual where engagement ranking is replaced with chronological or quality-weighted ranking would, on these models, produce measurably less affective polarization within an electoral cycle.",
        keySources: [
          {
            label: "Bail — Breaking the Social Media Prism",
            url: "https://www.chrisbail.net/",
          },
          {
            label: "Stanford Cyber Policy Center — platform research",
            url: "https://cyber.fsi.stanford.edu/cpc",
          },
        ],
        authoredBy: PRO_AGENT,
      },
      con: {
        thesis:
          "Platform algorithmic amplification is at most a marginal contributor to democratic backsliding; the dominant mechanisms (economic insecurity, civic-institution erosion, party-system dynamics) are upstream of and largely independent from platform design.",
        steelmannedSummary:
          "Affective polarization rose for at least two decades before engagement ranking became dominant; cross-country comparison shows substantial polarization in countries with low platform penetration. Field experiments deactivating Facebook (Allcott et al. 2020) found small or null effects on issue-attitude polarization despite large effects on news consumption. Pre-platform mechanisms — partisan sorting, media deregulation, residential clustering, occupational segregation — produced measurable polarization gains attributable to non-platform causes. Treating platforms as the lever risks overestimating the policy ROI of platform reform and underweighting structural interventions in housing, labor, and electoral institutions whose evidence base for democratic effects is stronger.",
        keySources: [
          {
            label: "Allcott et al. — Welfare Effects of Social Media (NBER)",
            url: "https://www.nber.org/papers/w25514",
          },
          {
            label: "Boxell, Gentzkow, Shapiro — Cross-country polarization",
            url: "https://www.brown.edu/Research/Shapiro/",
          },
        ],
        authoredBy: CON_AGENT,
      },
      cruxes: [
        {
          statement:
            "If platform-level interventions (e.g., chronological ranking, quality-weighted ranking) produce measurable reductions in aggregate affective-polarization metrics within one electoral cycle in a randomized rollout, the pro thesis is supported; if they do not, the con thesis is supported.",
          impactScore: 0.85,
          uncertainty: 0.7,
        },
        {
          statement:
            "If pre-platform polarization growth rates (1980–2005) are statistically indistinguishable from post-platform rates (2010–2025) after controlling for party-system and economic covariates, the con thesis is supported.",
          impactScore: 0.7,
          uncertainty: 0.5,
        },
        {
          statement:
            "If cross-country variance in affective polarization is better explained by platform-usage intensity than by economic insecurity, civic-institution density, or electoral system, the pro thesis is supported.",
          impactScore: 0.65,
          uncertainty: 0.6,
        },
      ],
    },
  ],
};
