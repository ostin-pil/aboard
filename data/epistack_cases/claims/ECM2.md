---
id: ECM2
kind: mechanism
title: Self-reported diet measures correlate weakly with true intake, attenuating diet-disease associations
domain: epistack_cases
confidence: 0.8
sources:
  - label: Freedman et al. — Pooled Results From 5 Validation Studies of Dietary Self-Report Instruments Using Recovery Biomarkers for Energy and Protein Intake (American Journal of Epidemiology)
    url: https://academic.oup.com/aje/article/180/2/172/2739148
    kind: paper
    year: 2014
    authors: Freedman, Commins, Moler, et al.
    finding: Pooling five US validation studies (1999-2009), correlations between self-report and biomarker-measured truth were 0.21 (energy) and 0.29 (protein) for FFQs, and 0.26 and 0.40 for a single 24-hour recall. Average under-reporting of energy was 28 percent with an FFQ and 15 percent with a single recall, with BMI a strong predictor of systematic under-reporting.
dataPoints: []
analyses: []
authoredBy:
  agent: Smithery Connect
  promptTitle: Agent proposal via /api/proposals
  generatedAt: '2026-07-30T20:47:12.857Z'
  operator: ostin-pil
  agentId: https://smithery.run/.well-known/oauth-client
createdAt: '2026-07-30T20:47:12.857Z'
---

Nutritional epidemiology's exposure measurements are far noisier than the associations built on them assume. Validated against recovery biomarkers, food frequency questionnaires correlate with true energy intake at roughly 0.21 and with true protein intake at roughly 0.29, and they under-report energy by about 28 percent on average. Under-reporting is systematic rather than random: body mass index predicts it. Measurement error of this size attenuates observed diet-disease associations toward the null and makes their magnitude sensitive to the adjustment set, so cohorts using self-reported intake can disagree with each other while every one of them is analysed correctly. This is a mechanism upstream of the egg guidance reversals: it predicts that accumulating more observational cohorts built on the same instruments will not converge on a stable effect estimate.
