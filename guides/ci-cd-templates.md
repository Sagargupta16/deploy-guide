# CI/CD Templates

Copy-paste-ready GitHub Actions workflows and CI/CD patterns for common deployment scenarios.

---

## Table of Contents

- [React to GitHub Pages](#react-to-github-pages)
- [Next.js to Vercel](#nextjs-to-vercel)
- [Express to Render](#express-to-render)
- [FastAPI to Render](#fastapi-to-render)
- [Docker to AWS ECR + ECS](#docker-to-aws-ecr--ecs)
- [Docker to Fly.io](#docker-to-flyio)
- [Multi-Environment Pipeline (Staging + Production)](#multi-environment-pipeline-staging--production)
- [Branch Protection & Required Checks](#branch-protection--required-checks)
- [Deploy Previews](#deploy-previews)
- [Secrets Management in CI](#secrets-management-in-ci)
- [Caching Dependencies](#caching-dependencies)
- [Matrix Builds](#matrix-builds)
- [Troubleshooting](#troubleshooting)

---

## React to GitHub Pages

Complete workflow to build a Vite React app and deploy to GitHub Pages.

**File: `.github/workflows/deploy-gh-pages.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          VITE_API_URL: ${{ vars.VITE_API_URL }}

      - name: Setup Pages
        uses: actions/configure-pages@v6

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v5
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
```

**Prerequisites:**
- Repository Settings > Pages > Source: set to "GitHub Actions"
- If using a custom base path, set `base` in `vite.config.ts` to `/<repo-name>/`

---

## Next.js to Vercel

Vercel has native Git integration, so you typically do NOT need a GitHub Actions workflow. Deployment happens automatically.

**How it works:**

1. Connect your GitHub repository in the Vercel dashboard.
2. Every push to `main` triggers a production deployment.
3. Every push to any other branch creates a preview deployment.
4. Pull requests get automatic preview URLs as comments.

**Configuration (vercel.json, optional):**

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "regions": ["iad1"]
}
```

Do not use the `env` property in `vercel.json` -- Vercel recommends against it (the `@secret-name` indirection is legacy Vercel Secrets). Define environment variables in Project Settings in the dashboard instead.

**If you DO need a custom GitHub Actions workflow** (e.g., to run tests before deploying):

**File: `.github/workflows/deploy-vercel.yml`**

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Pull Vercel environment
        run: npx vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Build
        run: npx vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Deploy to Vercel
        run: npx vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

This is Vercel's recommended flow: build in CI, then upload only the prebuilt artifacts (`--prebuilt`), so Vercel does not rebuild. For preview deploys, use `--environment=preview` in the pull step and drop `--prod` from build and deploy.

**Getting Vercel credentials:**
- `VERCEL_TOKEN`: Account Settings > Tokens > Create
- `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`: Found in `.vercel/project.json` after running `vercel link`

---

## Express to Render

Render supports automatic deploys from Git, but you can also use deploy hooks for more control.

**Option 1: Deploy Hook (triggered from GitHub Actions after tests pass)**

**File: `.github/workflows/deploy-render.yml`**

```yaml
name: Deploy Express to Render

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run tests
        run: npm test
        env:
          NODE_ENV: test
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Render Deploy
        run: |
          curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_URL }}"
```

**Getting the deploy hook URL:**
Render Dashboard > Your Service > Settings > Deploy Hook > Copy URL. Store it as a GitHub secret.

**Option 2: Automatic Git deploy**
In Render, connect your GitHub repo and enable "Auto-Deploy" on the main branch. Every push triggers a deploy without any GitHub Actions needed.

---

## FastAPI to Render

Similar to Express, but with Python-specific build and test steps.

**File: `.github/workflows/deploy-fastapi.yml`**

```yaml
name: Deploy FastAPI to Render

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Setup Python
        uses: actions/setup-python@v6
        with:
          python-version: "3.14"
          cache: pip

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install pytest httpx

      - name: Run linter
        run: |
          pip install ruff
          ruff check .

      - name: Run tests
        run: pytest -v
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
          SECRET_KEY: test-secret-key

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Render Deploy
        run: |
          curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_URL }}"
```

**Render configuration (render.yaml):**

```yaml
services:
  - type: web
    name: fastapi-app
    runtime: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: PYTHON_VERSION
        value: "3.14"
      - key: DATABASE_URL
        fromDatabase:
          name: my-db
          property: connectionString
```

**Tip: free-tier keep-alive.** Render free services sleep after 15 minutes of inactivity (and Neon free-tier database branches archive after 24 hours idle), causing cold starts of 15-25 seconds. A scheduled workflow that pings an unauthenticated health endpoint keeps them warm at near-zero cost:

```yaml
name: Keep Alive

on:
  schedule:
    - cron: "*/30 * * * *"

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping health endpoint
        run: curl --silent --max-time 30 https://your-app.onrender.com/health || echo "ignoring failure"
```

The `|| echo` keeps the job green on transient failures so you do not get noise from failed runs.

---

## Docker to AWS ECR + ECS

Complete workflow to build a Docker image, push to ECR, and deploy to ECS.

**File: `.github/workflows/deploy-aws-ecs.yml`**

```yaml
name: Deploy to AWS ECS

on:
  push:
    branches: [main]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: my-app
  ECS_CLUSTER: my-cluster
  ECS_SERVICE: my-service
  ECS_TASK_DEFINITION: .aws/task-definition.json
  CONTAINER_NAME: my-app

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm

      - name: Install and test
        run: |
          npm ci
          npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build, tag, and push Docker image
        id: build-image
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

      - name: Update ECS task definition
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: ${{ env.ECS_TASK_DEFINITION }}
          container-name: ${{ env.CONTAINER_NAME }}
          image: ${{ steps.build-image.outputs.image }}

      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: ${{ env.ECS_SERVICE }}
          cluster: ${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true
```

**Prerequisites:**
- ECR repository created
- ECS cluster and service running
- IAM role with ECR push and ECS deploy permissions
- Task definition JSON file at `.aws/task-definition.json`
- Use OIDC (role-to-assume) instead of access keys for better security

---

## Docker to Fly.io

Complete workflow to deploy a Dockerized application to Fly.io.

**File: `.github/workflows/deploy-fly.yml`**

```yaml
name: Deploy to Fly.io

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm

      - name: Install and test
        run: |
          npm ci
          npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Setup Fly CLI
        uses: superfly/flyctl-actions/setup-flyctl@master

      - name: Deploy to Fly.io
        run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

**Getting the Fly API token:**

```bash
fly tokens create deploy -x 999999h
```

Store the token as `FLY_API_TOKEN` in your GitHub repository secrets.

**fly.toml (required in repo root):**

```toml
app = "my-app"
primary_region = "iad"

[build]

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

[env]
  NODE_ENV = "production"
  PORT = "8080"
```

---

## Multi-Environment Pipeline (Staging + Production)

A workflow that deploys to staging on every push to `main` and to production only on manual approval or tagged releases.

**File: `.github/workflows/deploy-multi-env.yml`**

```yaml
name: Multi-Environment Deploy

on:
  push:
    branches: [main]
    tags: ["v*"]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Run linter
        run: npm run lint

  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment:
      name: staging
      url: https://staging.example.com
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Deploy to Staging
        run: |
          curl -X POST "${{ secrets.RENDER_STAGING_DEPLOY_HOOK }}"
          echo "Deployed to staging"

  deploy-production:
    needs: test
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')
    environment:
      name: production
      url: https://example.com
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Deploy to Production
        run: |
          curl -X POST "${{ secrets.RENDER_PRODUCTION_DEPLOY_HOOK }}"
          echo "Deployed to production"
```

**How to use:**
- Push to `main` -> runs tests -> deploys to staging automatically.
- Create a tag (`git tag v1.2.0 && git push --tags`) -> runs tests -> deploys to production.
- The `environment` key enables GitHub's environment protection rules (required reviewers, wait timers).

**Setting up environment protection:**
1. Go to Repository Settings > Environments.
2. Create `staging` and `production` environments.
3. On `production`, add required reviewers and/or a wait timer.
4. Add environment-specific secrets (different `DATABASE_URL` for each).

---

## Branch Protection & Required Checks

Configure branch protection to prevent merging code that fails CI.

**Recommended settings for `main` branch:**

1. **Repository Settings > Branches > Add rule** for `main`:
   - Require a pull request before merging
   - Require approvals: 1 (or more for teams)
   - Require status checks to pass before merging
   - Select your CI job names (e.g., `test`, `lint`)
   - Require branches to be up to date before merging
   - Do not allow bypassing the above settings

**Example: CI check that must pass before merge**

**File: `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

The job name `test` is what you select as a required status check in branch protection settings.

---

## Deploy Previews

### Vercel (Automatic)

Every pull request gets an automatic preview deployment. Vercel posts a comment on the PR with the preview URL. No configuration needed beyond connecting your repo.

### Netlify (Automatic)

Same as Vercel. Netlify automatically creates deploy previews for PRs (enabled by default, toggled under Project configuration > Build & deploy > Continuous deployment > Branches and deploy contexts). PR comments with the preview URL are configured under Project configuration > Notifications > Deploy notifications.

### Manual Preview Deploys (Other Platforms)

For platforms without built-in PR previews, you can create a workflow:

```yaml
name: Deploy Preview

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - name: Setup Fly CLI
        uses: superfly/flyctl-actions/setup-flyctl@master

      - name: Deploy Preview
        id: deploy
        run: |
          flyctl apps create pr-${{ github.event.pull_request.number }} --org personal || true
          flyctl deploy --app pr-${{ github.event.pull_request.number }} --remote-only
          echo "url=https://pr-${{ github.event.pull_request.number }}.fly.dev" >> $GITHUB_OUTPUT
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      - name: Comment PR
        uses: actions/github-script@v9
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `Preview deployed: ${{ steps.deploy.outputs.url }}`
            })
```

---

## Secrets Management in CI

### Best Practices

1. **Never echo secrets.** GitHub masks them in logs, but avoid `echo $SECRET` regardless.
2. **Use OIDC where possible.** For AWS, use `role-to-assume` instead of storing access keys.
3. **Scope secrets to environments.** Production secrets should only be available in the `production` environment.
4. **Rotate secrets regularly.** Set a calendar reminder to rotate CI secrets every 90 days.
5. **Audit secret access.** GitHub's audit log shows when secrets are accessed.

### Using Secrets Safely

```yaml
steps:
  - name: Deploy
    env:
      # Secrets are injected as environment variables
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      API_KEY: ${{ secrets.API_KEY }}
    run: ./deploy.sh

  # NEVER do this:
  # - run: echo ${{ secrets.API_KEY }}
  # - run: curl -H "Authorization: ${{ secrets.API_KEY }}" ...
  #   (use env vars instead to prevent accidental logging)
```

### Secrets in Forks

Secrets are NOT available to workflows triggered by pull requests from forks. This is a security feature. See the [Environment Variables guide](./environment-variables.md#variables-not-available-in-cicd-forks) for details.

---

## Caching Dependencies

Caching dramatically speeds up CI builds by reusing downloaded dependencies.

### npm (Node.js)

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v6
  with:
    node-version: 22
    cache: npm   # Automatically caches ~/.npm based on package-lock.json
```

The `cache` input also supports `pnpm` and `yarn`. For pnpm, run `pnpm/action-setup@v4` BEFORE `setup-node` (the cache step fails if pnpm is not on PATH yet), then install with `pnpm install --frozen-lockfile`. Current pnpm is v11, which requires Node 22.13+.

Tip: pin the Node version in `.nvmrc` and reference it with `node-version-file: ".nvmrc"` instead of `node-version` so CI and local never drift.

Or manual cache control:

```yaml
- name: Cache node_modules
  uses: actions/cache@v6
  with:
    path: node_modules
    key: node-modules-${{ hashFiles('package-lock.json') }}
    restore-keys: |
      node-modules-
```

### pip (Python)

```yaml
- name: Setup Python
  uses: actions/setup-python@v6
  with:
    python-version: "3.14"
    cache: pip   # Automatically caches pip downloads based on requirements.txt
```

Or manual cache:

```yaml
- name: Cache pip
  uses: actions/cache@v6
  with:
    path: ~/.cache/pip
    key: pip-${{ hashFiles('requirements.txt') }}
    restore-keys: |
      pip-
```

### uv (Python, alternative)

The [uv](https://docs.astral.sh/uv/) package manager has an official setup action with caching built in, replacing the setup-python + cache boilerplate:

```yaml
- name: Setup uv
  uses: astral-sh/setup-uv@v8
  with:
    python-version: "3.14"
    enable-cache: true

- name: Install dependencies
  run: uv sync
```

### Docker Layer Caching

```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v4

- name: Build and push
  uses: docker/build-push-action@v7
  with:
    context: .
    push: true
    tags: my-image:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

---

## Matrix Builds

Test across multiple versions of Node.js or Python to ensure compatibility.

### Node.js Matrix

```yaml
name: Test Matrix

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [22, 24]
      fail-fast: false
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm test
```

### Python Matrix

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.12", "3.13", "3.14"]
      fail-fast: false
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-python@v6
        with:
          python-version: ${{ matrix.python-version }}
          cache: pip
      - run: |
          pip install -r requirements.txt
          pytest -v
```

### Multi-OS Matrix

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: [22, 24]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm test
```

`fail-fast: false` ensures all matrix combinations run even if one fails. This helps identify which specific version/OS has the issue.

---

## Troubleshooting

### Permission Denied

**Symptoms:** `Permission denied`, `Resource not accessible by integration`, 403 errors.

**Fixes:**
1. **GitHub Pages:** Add the `permissions` block to your workflow:
   ```yaml
   permissions:
     contents: read
     pages: write
     id-token: write
   ```
2. **Repository Settings:** Go to Settings > Actions > General > Workflow permissions. Select "Read and write permissions."
3. **AWS:** Verify the IAM role has the required permissions (ECR push, ECS deploy).
4. **Fly.io:** Regenerate the API token and update the secret.

### Secrets Not Available in Forks

**Symptoms:** Deployment works on the main repo but secrets are empty in fork PRs.

**Explanation:** This is intentional. GitHub does not expose secrets to fork PRs to prevent secret exfiltration.

**Workaround for tests (not deploy):**
- Use `pull_request_target` event (runs in the context of the base repo, has access to secrets).
- Only use `pull_request_target` for safe operations (linting, testing). NEVER use it to run arbitrary code from the PR.

**Best approach:** Fork PRs should run tests without secrets (use mock/test databases). Deployment should only happen after merge to `main`.

### Build Cache Issues

**Symptoms:** Build uses stale dependencies, `node_modules` has wrong versions, mysterious build failures that pass locally.

**Fixes:**
1. **Bust the cache:** Change the cache key to force a fresh install:
   ```yaml
   key: node-modules-v2-${{ hashFiles('package-lock.json') }}
   #                    ^^ increment this
   ```
2. **Use `npm ci`** instead of `npm install`. `npm ci` deletes `node_modules` and installs from `package-lock.json` exactly.
3. **Clear GitHub Actions cache:** Go to Repository > Actions > Caches and delete stale caches.
4. **Docker cache:** Add `--no-cache` flag to `docker build` to force a clean build.

### Workflow Not Triggering

**Symptoms:** Push to `main` but no workflow runs.

**Fixes:**
1. **Check the file path:** Workflow files must be in `.github/workflows/` (note the plural).
2. **Check the branch filter:** `branches: [main]` will not trigger on `master` (and vice versa).
3. **Check the event:** `on: push` triggers on push; `on: pull_request` triggers on PR events. They are different.
4. **Disabled workflows:** Go to Actions tab and check if the workflow is disabled.
5. **Syntax error:** A YAML syntax error silently prevents the workflow from running. Validate with `actionlint` or the GitHub Actions VS Code extension.
6. **Bot commits:** Pushes made by a workflow using the default `GITHUB_TOKEN` (e.g., a scheduled job committing generated files) never trigger `on: push` -- this prevents infinite loops. To chain workflows, use `on: workflow_run: { workflows: ["First Workflow"], types: [completed] }` in the second workflow and gate its jobs with `github.event.workflow_run.conclusion == 'success'`.

### Build Timeout

**Symptoms:** Job exceeds the 6-hour limit or takes much longer than expected.

**Fixes:**
1. **Add caching** (see [Caching Dependencies](#caching-dependencies)).
2. **Set a timeout** to fail fast instead of wasting minutes:
   ```yaml
   jobs:
     build:
       timeout-minutes: 15
   ```
3. **Optimize Docker builds:** Use multi-stage builds, order layers from least to most frequently changed, and leverage BuildKit cache mounts.
4. **Reduce test scope in CI:** Run unit tests in CI, save integration/E2E tests for a separate nightly job.
