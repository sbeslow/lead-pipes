# Chicago Park District Fountain Lead Testing Data

FOIA'd lead testing data for all drinking water fountains in Chicago parks (2,807 fixtures, 402 parks, 5 years of test results).

## Data Pipeline

```
data/raw/          → original FOIA response (never modified)
data/processed/    → cleaned CSVs (source of truth)
data/build/        → generated artifacts consumed by apps
```

## Scripts
### Using code to generate lats/longs
### Generate fountains data in json format for the app

```
scripts/
```

## Apps

- `apps/shouldidrinkherecom/` — [ShouldIDrinkHere.com](apps/shouldidrinkherecom/README.md): mobile-first map showing safe/unsafe fountains
