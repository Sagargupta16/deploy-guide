# Deploy to AWS Amplify

Full-stack serverless deployment with CI/CD, preview environments, and auto-cleanup.

## Prerequisites

- AWS account with Amplify access
- GitHub repository
- Node.js 20+

## Setup

### 1. Create Amplify App

```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Initialize in your project
amplify init
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
        - npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

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
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - uses: aws-actions/configure-aws-credentials@v4
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
          UPLOAD_URL=$(aws amplify create-deployment --app-id ${{ secrets.AMPLIFY_APP_ID }} --branch-name $BRANCH_NAME --query 'zipUploadUrl' --output text)
          curl -T $ZIP_FILE "$UPLOAD_URL"
```

### 4. Preview Environments (Per PR)

Add a second workflow for PR previews:

```yaml
# .github/workflows/preview.yml
name: Preview
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      # Same as deploy but with branch name: pr-${{ github.event.number }}
      # Comment the preview URL on the PR
      # Auto-delete on PR close
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

- Free tier: 1000 build minutes/month, 5 GB hosting, 15 GB bandwidth
- After free tier: ~$0.01/build minute, $0.15/GB served

## Tips

- Use OIDC role assumption (no static AWS keys in GitHub secrets)
- Set up auto-cleanup to delete preview environments on PR close
- Use `amplify_outputs.json` to connect frontend to backend services
