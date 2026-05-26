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

- `frontend/` + `app/` — Flask + React app, hosted on AWS App Runner

## Local Development

```bash
# Terminal 1: Flask backend (http://localhost:5000)
python run.py

# Terminal 2: React frontend (http://localhost:5173, proxies /api to :5000)
cd frontend && npm run dev
```

## Deployment

The app runs on AWS App Runner at [shouldidrinkfromhere.com](https://shouldidrinkfromhere.com).

To deploy a new version:

```bash
./deploy.sh
```

This builds the React frontend, builds and pushes a Docker image to ECR, then triggers App Runner to redeploy. Deployment takes ~2 minutes. Prerequisites: AWS CLI configured, Docker running, Node.js installed.
