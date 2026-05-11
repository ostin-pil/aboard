---
id: IS1
kind: symptom
title: Top 1% income share above the post-WWII trough across major economies
domain: inequality
confidence: 0.9
sources:
  - label: World Inequality Database — country dashboards
    url: 'https://wid.world/'
    kind: dataset
    finding: Pre-tax top 1% income share has reverted toward early-20th-century levels in the US, UK, and France since 1980, after a postwar trough.
  - label: Saez & Zucman — wealth concentration data
    url: 'https://eml.berkeley.edu/~saez/'
    kind: dataset
    authors: Saez, Zucman
    finding: US top-1% wealth share has roughly doubled since 1980 by their distributional national accounts methodology.
dataPoints:
  - metric: Top 1% share of pre-tax national income (US)
    value: 0.205
    unit: share
    period: '2022'
    geography: US
    source:
      label: World Inequality Database — US
      url: 'https://wid.world/country/usa/'
      kind: dataset
      year: 2022
      finding: Above 1980 peak; near 1929 levels.
  - metric: Top 1% share of pre-tax national income (France)
    value: 0.11
    unit: share
    period: '2022'
    geography: FR
    source:
      label: World Inequality Database — France
      url: 'https://wid.world/country/france/'
      kind: dataset
      year: 2022
      finding: Smaller rise than US but still above postwar trough of ~0.08.
authoredBy:
  agent: claude-opus-4-7
  promptTitle: Seed claim author v0.1
  generatedAt: '2026-05-11T12:00:00Z'
createdAt: '2026-05-11T12:00:00Z'
---
Pre-tax top 1% income shares in major economies — the US most acutely, the UK and France more moderately — have risen back above the post-WWII trough and approach pre-Depression levels, reversing the mid-century compression.
