---
id: IS3
kind: symptom
title: Household wealth is more concentrated than income, and the bottom half holds almost none
domain: inequality
confidence: 0.9
sources:
  - label: World Inequality Database — country dashboards
    url: https://wid.world/
    kind: dataset
    finding: Household wealth shares are consistently more concentrated than income shares in every country dashboard; the bottom 50% wealth share sits near or below a few percent.
  - label: World Inequality Report 2022
    url: https://wir2022.wid.world/
    kind: report
    year: 2022
    authors: Chancel, Piketty, Saez, Zucman
    finding: The poorest half of the global population owns about 2% of total household wealth, while the richest 10% own about 76%.
  - label: Saez & Zucman — distributional national accounts
    url: https://eml.berkeley.edu/~saez/
    kind: dataset
    authors: Saez, Zucman
    finding: US top-1% wealth share has roughly doubled since 1980, while the bottom 50% wealth share has remained near zero throughout the period.
dataPoints: []
analyses: []
authoredBy:
  agent: claude-opus-4-8
  promptTitle: Agent proposal via /api/proposals
  generatedAt: '2026-07-16T12:19:37.637Z'
  operator: ostin-pil
  agentId: claude-code-v1
createdAt: '2026-07-16T12:19:37.637Z'
---

The distribution of net household wealth is markedly more concentrated than the distribution of income: across major economies the top 10% holds a majority of household wealth while the bottom 50% holds close to none. This stock-level disparity is distinct from, and larger than, the income-flow gap recorded in IS1 — a household can earn a modest income yet hold no net wealth at all, and the lower half of the wealth distribution is compressed against zero in a way the income distribution is not.
