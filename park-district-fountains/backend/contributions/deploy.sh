#!/usr/bin/env bash
# Deploy the contributions Lambda function + API Gateway endpoint.
#
# Prerequisites:
#   - AWS CLI configured (aws configure)
#
# Usage:
#   BUCKET_NAME=shouldidrinkherecom-submissions ./deploy.sh
#
# To review submissions afterwards:
#   aws s3 sync s3://$BUCKET_NAME/submissions/ ./submissions/

set -euo pipefail

FUNCTION_NAME="fountain-contributions"
REGION="${AWS_REGION:-us-east-1}"
HANDLER="handler.handler"
ROLE_NAME="${FUNCTION_NAME}-role"
API_NAME="${FUNCTION_NAME}-api"
BUCKET_NAME="${BUCKET_NAME:?Set BUCKET_NAME env var (e.g. shouldidrinkherecom-submissions)}"

echo "==> Creating S3 submissions bucket (if needed)..."
if ! aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null; then
  aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region "$REGION" \
    $([ "$REGION" != "us-east-1" ] && echo "--create-bucket-configuration LocationConstraint=$REGION" || true)
  # Block all public access
  aws s3api put-public-access-block \
    --bucket "$BUCKET_NAME" \
    --public-access-block-configuration \
      "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  echo "    Created private bucket: $BUCKET_NAME"
fi

echo "==> Packaging Lambda (no npm install needed — AWS SDK is built in)..."
zip -j function.zip handler.js

echo "==> Checking for existing IAM role..."
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null || true)
if [ -z "$ROLE_ARN" ]; then
  echo "==> Creating IAM role..."
  ROLE_ARN=$(aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
    --query 'Role.Arn' --output text)
  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  # Allow Lambda to write to the submissions bucket only
  aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "s3-submissions-write" \
    --policy-document "{
      \"Version\": \"2012-10-17\",
      \"Statement\": [{
        \"Effect\": \"Allow\",
        \"Action\": [\"s3:PutObject\"],
        \"Resource\": \"arn:aws:s3:::${BUCKET_NAME}/submissions/*\"
      }]
    }"
  echo "    Waiting for role to propagate..."
  sleep 10
fi

echo "==> Deploying Lambda function..."
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" &>/dev/null; then
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb://function.zip \
    --region "$REGION"
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --environment "Variables={BUCKET_NAME=$BUCKET_NAME}" \
    --region "$REGION"
else
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime "nodejs22.x" \
    --role "$ROLE_ARN" \
    --handler "$HANDLER" \
    --zip-file fileb://function.zip \
    --timeout 10 \
    --environment "Variables={BUCKET_NAME=$BUCKET_NAME}" \
    --region "$REGION"
fi

echo "==> Setting up API Gateway..."
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" \
  --query "Items[?Name=='$API_NAME'].ApiId" --output text)

if [ -z "$API_ID" ]; then
  API_ID=$(aws apigatewayv2 create-api \
    --name "$API_NAME" \
    --protocol-type HTTP \
    --cors-configuration AllowOrigins='["*"]',AllowMethods='["POST","OPTIONS"]',AllowHeaders='["Content-Type"]' \
    --region "$REGION" \
    --query 'ApiId' --output text)

  LAMBDA_ARN=$(aws lambda get-function \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --query 'Configuration.FunctionArn' --output text)

  INTEGRATION_ID=$(aws apigatewayv2 create-integration \
    --api-id "$API_ID" \
    --integration-type AWS_PROXY \
    --integration-uri "$LAMBDA_ARN" \
    --payload-format-version "2.0" \
    --region "$REGION" \
    --query 'IntegrationId' --output text)

  aws apigatewayv2 create-route \
    --api-id "$API_ID" \
    --route-key "POST /submit" \
    --target "integrations/$INTEGRATION_ID" \
    --region "$REGION"

  aws apigatewayv2 create-stage \
    --api-id "$API_ID" \
    --stage-name '$default' \
    --auto-deploy \
    --region "$REGION"

  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "apigateway-invoke" \
    --action "lambda:InvokeFunction" \
    --principal "apigateway.amazonaws.com" \
    --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*/*/submit" \
    --region "$REGION"
fi

ENDPOINT="https://${API_ID}.execute-api.${REGION}.amazonaws.com/submit"
echo ""
echo "==> Done!"
echo "    Submissions bucket: s3://$BUCKET_NAME/submissions/"
echo "    API endpoint:       $ENDPOINT"
echo ""
echo "    Add this to apps/shouldidrinkherecom/web/app.js:"
echo "    const CONTRIBUTIONS_API = \"$ENDPOINT\";"
echo ""
echo "    To review submissions:"
echo "    aws s3 sync s3://$BUCKET_NAME/submissions/ ./submissions/"
