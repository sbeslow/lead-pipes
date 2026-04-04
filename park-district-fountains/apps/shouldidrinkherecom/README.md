# ShouldIDrinkHere.com

Mobile-first web app showing Chicago Park District fountain lead test results on a map.

## Local development

From the repo root:

```bash
python -m http.server 8000
# Open http://localhost:8000/apps/shouldidrinkherecom/web/
```

## Deploy to S3

```bash
# One-time setup
aws s3 mb s3://YOUR_BUCKET_NAME
aws s3 website s3://YOUR_BUCKET_NAME --index-document index.html

# Deploy
aws s3 sync apps/shouldidrinkherecom/web/ s3://YOUR_BUCKET_NAME --acl public-read
aws s3 cp data/build/fountains.json s3://YOUR_BUCKET_NAME/fountains.json --acl public-read
```

Add a CloudFront distribution for HTTPS + custom domain.

## Safety levels - what should we call safe?

| Level   | Criteria                                  |
|---------|-------------------------------------------|
| Safe    | Latest result < 5 ppb, fountain active    |
| Caution | Latest result 5–15 ppb                    |
| Danger  | Latest result > 15 ppb (EPA action level) |
| Unknown | Offline, removed, or no test result       |

Fountains with status `CONT` (remediation continuation) are evaluated by their test result like any active fountain. Only `OFF`, `REMOVED`, and `DOES NOT EXIST` are treated as unknown.

Park-level safety is the worst safety level among its active fixtures.
