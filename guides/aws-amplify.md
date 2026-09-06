# AWS Amplify

> Deploy a full-stack Amplify Gen 2 app with CI/CD, per-PR preview environments, and auto-cleanup.

Amplify Hosting builds and serves your frontend, while Amplify Gen 2 defines the backend (AppSync, DynamoDB, Cognito, S3, Lambda) as TypeScript that compiles to CDK. The two halves deploy separately, and getting the order right is the single thing that trips up every first Amplify deploy: the backend deploy generates `amplify_outputs.json`, and the frontend build needs that file to know its API endpoints. This guide covers app creation, the `amplify.yml` build spec, a GitHub Actions pipeline that replaces Amplify's built-in CI, per-PR previews with cleanup, environment variables and secrets, custom domains, and the failures you will actually hit.

## Prerequisites

- [ ] An [AWS account](https://portal.aws.amazon.com/billing/signup) with Amplify access
- [ ] A [GitHub account](https://github.com/signup) and a repository to deploy
- [ ] [Node.js 22+](https://nodejs.org/) installed
- [ ] [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) installed and configured (`aws configure`)
- [ ] [Git](https://git-scm.com/downloads) installed

---

## Step 1: Create the Amplify App

```bash
# Scaffold a new Amplify Gen 2 project
# (the Gen 1 CLI, @aws-amplify/cli + amplify init, is in maintenance mode
# and reaches end of life on 2027-05-01)
npm create amplify@latest

# Local dev: deploy a per-developer cloud sandbox
npx ampx sandbox
```

Or use the AWS Console: Amplify > Create new app > Connect GitHub repo.

`ampx sandbox` is for local development only -- it stands up a throwaway per-developer stack and hot-reloads it. It is never what CI runs; pipelines use `ampx pipeline-deploy` (Step 3).

## Step 2: Configure Build Settings

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

Note that `npm ci` runs *before* `ampx pipeline-deploy` here. That order is mandatory: `pipeline-deploy` compiles `amplify/backend.ts`, which imports `@aws-amplify/backend` from `node_modules`.

## Step 3: GitHub Actions CI/CD (Recommended)

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
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm

      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ secrets.AWS_IAM_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      # 1. Install first -- pipeline-deploy compiles amplify/backend.ts,
      #    which imports @aws-amplify/backend from node_modules
      - run: npm ci

      # 2. Backend deploy: writes amplify_outputs.json into the working tree
      - run: npx ampx pipeline-deploy --branch main --app-id ${{ secrets.AMPLIFY_APP_ID }}

      # 3. Frontend build: needs amplify_outputs.json to exist
      - run: npm run build

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

AWS's own custom-pipeline docs show the sequence `export CI=1`, `npm ci`, `npx ampx pipeline-deploy`. On GitHub Actions the `CI` step is unnecessary: the runner always sets `CI=true` for every step. Do not try to satisfy it with a standalone `- run: export CI=1` step either, since each `run` gets its own shell and the export dies with it. If you want it explicit, put `CI: 1` under a job-level or step-level `env:` block.

Two things to set up once in the Amplify console before an external pipeline works:

- Connect the fullstack branch a single time, so Amplify knows about it.
- Turn off auto-build on that branch, so pushes do not trigger an Amplify build that races your workflow. If you would rather keep Amplify's build for the frontend, swap `pipeline-deploy` for `npx ampx generate outputs --branch $AWS_BRANCH --app-id $AWS_APP_ID` in `amplify.yml` so that build fetches the existing backend config instead of redeploying it.

## Step 4: Preview Environments (Per PR)

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
      # - npm ci, THEN npx ampx pipeline-deploy --branch pr-N --app-id <id>, THEN npm run build
      # - preview URL: https://pr-N.<appId>.amplifyapp.com (comment it on the PR)
  cleanup:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      # Delete the Amplify branch, then find and delete the branch's backend
      # CloudFormation stack -- deleting the hosting branch alone does not
      # remove Gen 2 backend resources. See Troubleshooting for the commands.
```

## Backend Services

Amplify Gen 2 provides:

- **AppSync** - GraphQL API
- **DynamoDB** - NoSQL database
- **Cognito** - Authentication
- **S3** - File storage
- **Lambda** - Serverless functions

All defined as Infrastructure as Code via CDK.

## Environment Variables

Amplify splits configuration into two stores, and picking the wrong one is a security bug rather than an inconvenience. Environment variables are managed by Amplify Hosting and are **rendered in plaintext into your build artifacts**, readable by anyone with artifact access or `amplify get-app` permission. Secrets live in AWS Systems Manager Parameter Store and are resolved only at build and deploy time.

| Variable | Description | Example |
|----------|-------------|---------|
| `AWS_APP_ID` | App ID of the current build (injected) | `abcd1234` |
| `AWS_BRANCH` | Branch name of the current build (injected) | `main` |
| `AWS_COMMIT_ID` | Commit SHA of the current build (injected) | `abcd1234` |
| `AWS_PULL_REQUEST_ID` | PR number, on preview builds only (injected) | `42` |
| `_BUILD_TIMEOUT` | Build timeout in minutes (min 5, max 120) | `30` |
| `USER_DISABLE_TESTS` | Skip the test phase for a branch | `true` |
| `VITE_API_URL` | Your own non-sensitive app config | `https://api.example.com` |

Constraints Amplify enforces: names cannot start with `AWS` (that prefix is reserved for the injected variables above), and a value cannot exceed 5,500 characters. Stored values are encrypted at rest.

### Set non-sensitive variables

In the console: App > Hosting > Environment variables > Manage variables. A variable can apply to all branches or to specific branches.

Amplify exposes these to the build shell, but does not automatically inline them into your bundle. Write them into a `.env` file in `amplify.yml` first:

```yaml
frontend:
  phases:
    build:
      commands:
        - echo "VITE_API_URL=$VITE_API_URL" >> .env
        - npm run build
```

### Set secrets

Console path: App > Hosting > Secrets > Manage secrets. Values land in Parameter Store at `/amplify/shared/<app-id>/<secret-key>` when shared across branches, or `/amplify/<app-id>/<branchname>-branch-<hash>/<secret-key>` when scoped to one branch.

For your local sandbox:

```bash
npx ampx sandbox secret set MY_OAUTH_CLIENT_ID
npx ampx sandbox secret set MY_OAUTH_CLIENT_SECRET

# tear-down is manual
npx ampx sandbox secret remove MY_OAUTH_CLIENT_ID
```

Sandbox secrets do not appear in the Amplify console -- look in the Parameter Store console instead.

Reference them in backend code with `secret()`, and Amplify resolves the right value per environment:

```ts
import { defineAuth, secret } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: {
      google: {
        clientId: secret('MY_OAUTH_CLIENT_ID'),
        clientSecret: secret('MY_OAUTH_CLIENT_SECRET')
      }
    }
  }
});
```

To feed a local `.env.local` into a sandbox run:

```bash
npx dotenvx run --env-file=.env.local -- ampx sandbox
```

## Custom Domain

1. In the Amplify console, open your app and choose **Hosting > Custom domains > Add domain**.
2. Enter the root domain (`example.com`, not `https://example.com`).
3. If the domain is not already in Route 53, Amplify offers two paths:
   - **Create hosted zone on Route 53** -- Amplify creates the zone and shows you its name servers. Add those at your registrar, then tick "I have added the above name servers to my domain registry".
   - **Manual configuration** -- keep DNS where it is and add the records Amplify displays yourself. GoDaddy and Cloudflare have provider-specific pages in the AWS docs; on Cloudflare set the records to **DNS only** (grey cloud), since proxying breaks Amplify's validation.
4. By default Amplify creates two entries, `example.com` and `www.example.com`, with a redirect from the root to `www`. Change that under **Rewrites and redirects** if you want subdomains only.
5. Choose the SSL/TLS certificate: **Amplify managed certificate** (free, auto-renewing, the default) or **Custom SSL certificate** if you have already imported one into AWS Certificate Manager.
6. Choose **Add domain**. The domain stays pending until DNS propagates and ACM validates the certificate.

Notes:

- A custom certificate must already exist in ACM -- Amplify only lets you select from certificates that are there.
- Attaching a domain that is or was associated with an Amplify app in a **different AWS account in the same region** is a cross-account association and requires manual verification through AWS Support.

## Free Tier Info

| Feature | Monthly allowance | Beyond the allowance |
|---------|-------------------|----------------------|
| **Build minutes** | 1,000 | $0.01/min standard, $0.025 Large, $0.10 XLarge |
| **Data stored** | 5 GB on the CDN | $0.023/GB/month |
| **Data served** | 15 GB | $0.15/GB |
| **SSR requests** | 500,000 | $0.30 per 1M |
| **SSR duration** | 100 GB-hours | $0.20/GB-hour |

Key things to know:

- AWS Free Tier changed on 2025-07-15: new accounts get $100 in credits at signup (up to $200 total) on a 6-month Free plan. The old 12-month free tier only applies to accounts created before that date.
- Backend resources (AppSync, DynamoDB, Cognito, Lambda, S3) bill separately under their own service pricing, not against the Amplify allowances above.
- Preview environments consume build minutes and, on Gen 2, stand up a real backend stack per PR. Cleanup on PR close is a cost control, not just hygiene.

## Troubleshooting

### Problem: `ampx pipeline-deploy` fails with "Cannot find module '@aws-amplify/backend'"

**Cause:** The deploy step ran before dependencies were installed. `pipeline-deploy` type-checks and compiles `amplify/backend.ts`, which imports the Amplify backend packages from `node_modules`.

**Fix:** Put the install first, always.

```yaml
- run: npm ci
- run: npx ampx pipeline-deploy --branch main --app-id $AMPLIFY_APP_ID
```

### Problem: The site deploys but every API call fails, or `amplify_outputs.json` is missing from `dist`

**Cause:** Two variants. Either the frontend build ran before the backend deploy, so `amplify_outputs.json` did not exist yet, or it ran after but the bundler never copied the file into the output directory.

**Fix:** Order the steps `npm ci`, then `ampx pipeline-deploy`, then `npm run build`. Then confirm the file shipped:

```bash
ls -l dist/amplify_outputs.json
```

If it is absent, add a copy step to your bundler (for example a Vite `closeBundle` hook) or copy it explicitly before the upload.

### Problem: "Not authorized to perform sts:AssumeRoleWithWebIdentity"

**Cause:** The OIDC trust policy on the IAM role does not match the workflow's identity, or the workflow never requested an OIDC token.

**Fix:** Confirm the job has `permissions: id-token: write`, then compare the role's trust policy `sub` condition against what the run actually presents. `repo:OWNER/REPO:ref:refs/heads/main` does not match a `pull_request` run, and `repo:OWNER/REPO:pull_request` does not match a push to main.

```bash
aws iam get-role --role-name my-amplify-deploy-role \
  --query 'Role.AssumeRolePolicyDocument'
```

### Problem: `ampx sandbox` works locally but CI cannot deploy the same backend

**Cause:** `sandbox` and `pipeline-deploy` are different commands with different targets. `sandbox` creates an ephemeral per-developer stack and takes no `--branch` or `--app-id`. `pipeline-deploy` deploys to a real branch of a real app, requires both flags, and requires that branch to have been connected in the Amplify console at least once.

**Fix:** Connect the branch once in the console, then use `pipeline-deploy` with explicit identifiers in CI. Never run `ampx sandbox` from a pipeline.

### Problem: The Amplify build uses a different Node version than your project

**Cause:** The managed build image ships its own Node, which may not match what your app needs.

**Fix:** Switch versions in the `preBuild` phase using the nvm already present in the image:

```yaml
frontend:
  phases:
    preBuild:
      commands:
        - nvm install 22
        - nvm use 22
        - npm ci
```

If you need a fully custom build image instead, it must be a glibc Linux distribution compiled for x86-64 and must have cURL, Git, OpenSSH, Bash and the Bourne shell, plus Node and npm. Missing cURL fails the build instantly with no log output at all, because the build runner cannot download itself into the container.

### Problem: PRs are closed but CloudFormation stacks and bills keep accumulating

**Cause:** Deleting an Amplify hosting branch removes the hosting branch only. On Gen 2 the backend lives in its own CloudFormation stack, and nothing cleans that up automatically.

**Fix:** Delete the hosting branch, then find and delete the backend stack in the same PR-close job.

```bash
aws amplify delete-branch --app-id "$APP_ID" --branch-name "pr-$PR"

# Find candidate backend stacks for this branch, then delete each one.
stacks=$(aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE \
  --query "StackSummaries[?contains(StackName, '$APP_ID') && contains(StackName, 'pr-$PR')].StackName" \
  --output text)

echo "matched: $stacks"

for stack in $stacks; do
  aws cloudformation delete-stack --stack-name "$stack"
done
```

AWS does not document the stack name Amplify Gen 2 gives a branch backend, so the filter above matches on the app ID and branch name rather than a fixed prefix. Echo the match and check it: an empty list means the filter missed, not that nothing is billing. If it comes back empty, open the CloudFormation console, search for the app ID, and confirm by hand before you trust the cleanup.

### Problem: An environment variable set in the console never reaches the browser

**Cause:** Amplify exposes environment variables to the build shell, not to your bundle. Vite, Next.js and CRA each inline only their own prefixed variables, and only if those are present in the environment when the bundler runs.

**Fix:** Write the value into a `.env` file in `amplify.yml` before the build command, using the prefix your framework expects (`VITE_`, `NEXT_PUBLIC_`, `REACT_APP_`).

```yaml
- echo "VITE_API_URL=$VITE_API_URL" >> .env
- npm run build
```

Anything inlined this way is public. Never do it with a secret.

## Tips

- Use OIDC role assumption (no static AWS keys in GitHub secrets): set `permissions: id-token: write` and pass `role-to-assume`
- Scope OIDC roles per environment: trust `sub = repo:OWNER/REPO:pull_request` for the preview role and `sub = repo:OWNER/REPO:ref:refs/heads/main` for production, so PR workflows physically cannot assume the production role
- Set up auto-cleanup to delete preview environments on PR close
- Use `amplify_outputs.json` to connect frontend to backend services
- Run the backend deploy before the frontend build -- `ampx pipeline-deploy` generates `amplify_outputs.json`, and building first ships a frontend without its API endpoints. If your bundler does not copy it into `dist`, add a copy step (e.g. a Vite `closeBundle` hook) and verify `dist/amplify_outputs.json` exists post-build
