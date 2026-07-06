# Deploy to AWS Amplify

Full-stack serverless deployment with CI/CD, preview environments, and auto-cleanup.

## Prerequisites

- AWS account with Amplify access
- GitHub repository
- Node.js 22+

## Setup

### 1. Create Amplify App

```bash
# Scaffold a new Amplify Gen 2 project
# (the Gen 1 CLI, @aws-amplify/cli + amplify init, is in maintenance mode
# and reaches end of life on 2027-05-01)
npm create amplify@latest

# Local dev: deploy a per-developer cloud sandbox
npx ampx sandbox
```

Or use the AWS Console: Amplify > Create new app > Connect GitHub repo.

### 2. Configure Build Settings

Create `amplify.yml` in your repo root:

```yaml
version: 1
backend:
  phases:
    build:
      commands:
        - npm ci --cache .npm --prefer-offline
        - npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID
frontend:
  phases:
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - .npm/**/*
      - node_modules/**/*
```

Amplify injects `$AWS_BRANCH` and `$AWS_APP_ID` automatically. The `--cache .npm` flag is what makes the `.npm/**/*` cache entry effective, so warm builds skip re-downloading packages.

### 3. GitHub Actions CI/CD (Recommended)

Instead of Amplify's built-in CI, use GitHub Actions for more control:

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: 22

      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ secrets.AWS_IAM_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - run: npx ampx pipeline-deploy --branch main --app-id ${{ secrets.AMPLIFY_APP_ID }}
      - run: npm ci && npm run build

      # Upload to Amplify Hosting
      - run: |
          BRANCH_NAME="main"
          aws amplify create-branch --app-id ${{ secrets.AMPLIFY_APP_ID }} --branch-name $BRANCH_NAME 2>/dev/null || true
          ZIP_FILE=$(mktemp).zip
          cd dist && zip -r $ZIP_FILE . && cd ..
          DEPLOYMENT=$(aws amplify create-deployment --app-id ${{ secrets.AMPLIFY_APP_ID }} --branch-name $BRANCH_NAME)
          JOB_ID=$(echo "$DEPLOYMENT" | jq -r '.jobId')
          UPLOAD_URL=$(echo "$DEPLOYMENT" | jq -r '.zipUploadUrl')
          curl -X PUT -T $ZIP_FILE "$UPLOAD_URL"
          aws amplify start-deployment --app-id ${{ secrets.AMPLIFY_APP_ID }} --branch-name $BRANCH_NAME --job-id $JOB_ID
```

`create-deployment` only stages the upload URL -- without `start-deployment` (using the returned `jobId`) the zip is never published. Poll `aws amplify get-job` if you need to wait for SUCCEED/FAILED.

### 4. Preview Environments (Per PR)

Add a second workflow for PR previews:

```yaml
# .github/workflows/preview.yml
name: Preview
on:
  pull_request:
    types: [opened, synchronize, closed]

jobs:
  preview:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    steps:
      # Same as deploy, but:
      # - create the branch as pr-${{ github.event.number }} with --no-enable-auto-build
      # - deploy backend: npx ampx pipeline-deploy --branch pr-N --app-id <id>
      # - preview URL: https://pr-N.<appId>.amplifyapp.com (comment it on the PR)
  cleanup:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      # Delete the Amplify branch, then delete the backend CloudFormation
      # stacks named amplify-<appId>-pr-N-branch-* -- deleting the hosting
      # branch alone does not remove Gen 2 backend resources
```

## Backend Services

Amplify Gen 2 provides:

- **AppSync** - GraphQL API
- **DynamoDB** - NoSQL database
- **Cognito** - Authentication
- **S3** - File storage
- **Lambda** - Serverless functions

All defined as Infrastructure as Code via CDK.

## Cost

- Monthly allowances: 1,000 build minutes, 5 GB stored on the CDN, 15 GB served, 500K SSR requests, 100 GB-hours SSR duration
- Beyond that: $0.01/build minute (standard; $0.025 Large, $0.10 XLarge), $0.023/GB/month storage, $0.15/GB served, $0.30 per 1M SSR requests + $0.20/GB-hour SSR duration
- AWS Free Tier changed on 2025-07-15: new accounts get $100 in credits at signup (up to $200 total) on a 6-month Free plan; the old 12-month free tier only applies to accounts created before that date

## Tips

- Use OIDC role assumption (no static AWS keys in GitHub secrets): set `permissions: id-token: write` and pass `role-to-assume`
- Scope OIDC roles per environment: trust `sub = repo:OWNER/REPO:pull_request` for the preview role and `sub = repo:OWNER/REPO:ref:refs/heads/main` for production, so PR workflows physically cannot assume the production role
- Set up auto-cleanup to delete preview environments on PR close
- Use `amplify_outputs.json` to connect frontend to backend services
- Run the backend deploy before the frontend build -- `ampx pipeline-deploy` generates `amplify_outputs.json`, and building first ships a frontend without its API endpoints. If your bundler does not copy it into `dist`, add a copy step (e.g. a Vite `closeBundle` hook) and verify `dist/amplify_outputs.json` exists post-build
