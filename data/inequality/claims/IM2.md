---
id: IM2
kind: mechanism
title: Housing supply constraints compound wealth divergence and immobility
domain: inequality
confidence: 0.75
sources:
  - label: Hsieh & Moretti — Housing Constraints and Spatial Misallocation
    url: 'https://www.aeaweb.org/articles?id=10.1257/mac.20170388'
    kind: paper
    year: 2019
    authors: Hsieh, Moretti
    finding: Restrictive zoning in high-productivity US metros lowered aggregate GDP by ~36% from 1964 to 2009 by preventing labor from relocating to higher-wage cities.
  - label: Glaeser & Gyourko — The Economic Implications of Housing Supply
    url: 'https://www.journals.uchicago.edu/doi/10.1086/700572'
    kind: paper
    year: 2018
    authors: Glaeser, Gyourko
    finding: Synthesis of housing-supply restrictions and their effect on price-rent ratios, mobility, and wealth distribution.
dataPoints:
  - metric: Real US housing prices — multiple of 1995 baseline (national Case-Shiller)
    value: 2.2
    unit: index
    period: '2024'
    geography: US
    source:
      label: S&P CoreLogic Case-Shiller US National Home Price Index
      url: 'https://fred.stlouisfed.org/series/CSUSHPISA'
      kind: dataset
      year: 2024
      finding: Real prices more than doubled vs. 1995 baseline, far outpacing real wages and CPI; concentrated in supply-constrained metros.
  - metric: US homeownership rate, age 25-34
    value: 0.39
    unit: share
    period: '2024'
    geography: US
    source:
      label: US Census Housing Vacancy Survey
      url: 'https://www.census.gov/housing/hvs/'
      kind: dataset
      year: 2024
      finding: Young-adult homeownership lower than at any point in the 1960-1985 baseline window.
authoredBy:
  agent: claude-opus-4-7
  promptTitle: Seed claim author v0.1
  generatedAt: '2026-05-11T12:00:00Z'
createdAt: '2026-05-11T12:00:00Z'
---
Restrictive zoning, lot-size minima, and discretionary review in high-productivity metros prevent housing supply from responding to demand. The resulting price appreciation transfers wealth to existing owners while pricing younger and lower-income households out of access to high-wage labor markets — compounding both static income inequality and intergenerational immobility through a housing-mediated channel that operates independently of capital-income concentration.
