#!/usr/bin/env bash
# Deploy shouldidrinkherecom to AWS App Runner.
#
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - Docker running
#   - Node.js installed
#
# Usage:
#   ./deploy.sh

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/shouldidrinkherecom"
SERVICE_ARN=$(aws apprunner list-services --region "$REGION" \
  --query "ServiceSummaryList[?ServiceName=='shouldidrinkherecom'].ServiceArn" \
  --output text)

echo "==> Building React frontend..."
(cd frontend && npm run build)

echo "==> Authenticating to ECR..."
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

echo "==> Building Docker image..."
docker build --platform linux/amd64 -t shouldidrinkherecom .

echo "==> Pushing to ECR..."
docker tag shouldidrinkherecom:latest "$ECR_REPO:latest"
docker push "$ECR_REPO:latest"

echo "==> Triggering App Runner deployment..."
aws apprunner start-deployment --service-arn "$SERVICE_ARN" --region "$REGION"

echo ""
echo "==> Done! App Runner is deploying the new image."
echo "    URL: https://shouldidrinkhere.com"
echo "    Check status: aws apprunner describe-service --service-arn $SERVICE_ARN --region $REGION --query 'Service.Status'"
