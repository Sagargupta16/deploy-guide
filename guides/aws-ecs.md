# AWS ECS

> Deploy production-grade containerized applications on AWS Elastic Container Service with Fargate or EC2 launch types.

AWS ECS (Elastic Container Service) is a fully managed container orchestration service. It runs your Docker containers at scale with deep integration into the AWS ecosystem -- load balancing, auto-scaling, IAM, CloudWatch, and more. ECS with Fargate is serverless (no EC2 instances to manage), while ECS with EC2 gives you full control over the underlying hosts.

## Prerequisites

- [ ] An [AWS account](https://aws.amazon.com/free/) with billing enabled
- [ ] [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) installed and configured
- [ ] [Docker](https://docs.docker.com/get-started/get-docker/) installed locally
- [ ] [Git](https://git-scm.com/downloads) installed locally
- [ ] (Optional) [jq](https://jqlang.org/download/) for parsing JSON output
- [ ] AWS CLI configured with credentials:

```bash
aws configure
# AWS Access Key ID: <your-key>
# AWS Secret Access Key: <your-secret>
# Default region name: us-east-1
# Default output format: json
```

Verify your setup:

```bash
aws sts get-caller-identity
docker --version
```

---

## Project Setup

This guide uses a Node.js Express app as the example. The same workflow applies to any Dockerized application.

### Sample Express App

Create `server.js`:

```js
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Hello from ECS!', env: process.env.NODE_ENV });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
```

Create `package.json`:

```json
{
  "name": "my-ecs-app",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^5.0.0"
  }
}
```

### Dockerfile

Create `Dockerfile`:

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
```

Create `.dockerignore`:

```
node_modules
npm-debug.log
.git
.gitignore
.env
Dockerfile
docker-compose*.yml
```

Test locally:

```bash
docker build -t my-ecs-app .
docker run -p 3000:3000 -e NODE_ENV=production my-ecs-app
# Visit http://localhost:3000
```

---

## Step 1: Create an ECR Repository

Amazon Elastic Container Registry (ECR) stores your Docker images. ECS pulls images from ECR during deployment.

```bash
# Set variables used throughout this guide
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO_NAME=my-ecs-app

# Create the ECR repository
aws ecr create-repository \
  --repository-name $ECR_REPO_NAME \
  --region $AWS_REGION \
  --image-scanning-configuration scanOnPush=true

# Store the repository URI
ECR_URI=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME
echo "ECR URI: $ECR_URI"
```

## Step 2: Build and Push Docker Image

```bash
# Authenticate Docker with ECR
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build the image
docker build -t $ECR_REPO_NAME .

# Tag and push
docker tag $ECR_REPO_NAME:latest $ECR_URI:latest
docker push $ECR_URI:latest
```

Verify the image was pushed:

```bash
aws ecr describe-images --repository-name $ECR_REPO_NAME --region $AWS_REGION
```

## Step 3: Create an ECS Cluster

```bash
ECS_CLUSTER_NAME=my-app-cluster

aws ecs create-cluster \
  --cluster-name $ECS_CLUSTER_NAME \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1
```

### Fargate vs EC2 Launch Types

| Feature | Fargate (recommended) | EC2 |
|---------|----------------------|-----|
| **Server management** | None (serverless) | You manage EC2 instances |
| **Scaling** | Per-task scaling | Instance + task scaling |
| **Pricing** | Pay per vCPU/memory/sec | Pay for EC2 instances |
| **GPU support** | No | Yes |
| **Best for** | Most workloads | GPU, large/persistent workloads |

This guide uses **Fargate** for simplicity.

## Step 4: Create IAM Roles

### Task Execution Role (allows ECS to pull images and write logs)

Create `trust-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

```bash
# Create the execution role
aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document file://trust-policy.json

# Attach the managed policy
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

## Step 5: Create a Task Definition

The task definition tells ECS how to run your container -- image, CPU, memory, ports, environment variables, and logging.

Create `task-definition.json`:

```json
{
  "family": "my-ecs-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::<ACCOUNT_ID>:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "my-ecs-app",
      "image": "<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/my-ecs-app:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:ssm:us-east-1:<ACCOUNT_ID>:parameter/my-app/DATABASE_URL"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/my-ecs-app",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      },
      "essential": true
    }
  ]
}
```

> **Note:** Replace `<ACCOUNT_ID>` with your actual AWS account ID.

Create the CloudWatch log group, then register the task definition:

```bash
# Create log group
aws logs create-log-group --log-group-name /ecs/my-ecs-app --region $AWS_REGION

# Register the task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

## Step 6: Set Up Networking (VPC, Subnets, Security Groups)

If you are using the default VPC, get the subnet and VPC IDs:

```bash
# Get default VPC
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)

# Get subnets
SUBNET_IDS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[*].SubnetId" --output text | tr '\t' ',')

echo "VPC: $VPC_ID"
echo "Subnets: $SUBNET_IDS"

# Create a security group for the ALB
ALB_SG=$(aws ec2 create-security-group \
  --group-name ecs-alb-sg \
  --description "ALB security group" \
  --vpc-id $VPC_ID \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 443 --cidr 0.0.0.0/0

# Create a security group for the ECS tasks
ECS_SG=$(aws ec2 create-security-group \
  --group-name ecs-task-sg \
  --description "ECS task security group" \
  --vpc-id $VPC_ID \
  --query 'GroupId' --output text)

# Allow traffic from ALB to ECS tasks on port 3000
aws ec2 authorize-security-group-ingress --group-id $ECS_SG --protocol tcp --port 3000 --source-group $ALB_SG
```

## Step 7: Create an Application Load Balancer (ALB)

```bash
# Get first two subnet IDs for ALB (needs at least 2 AZs)
SUBNET_1=$(echo $SUBNET_IDS | cut -d',' -f1)
SUBNET_2=$(echo $SUBNET_IDS | cut -d',' -f2)

# Create ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name my-ecs-app-alb \
  --subnets $SUBNET_1 $SUBNET_2 \
  --security-groups $ALB_SG \
  --scheme internet-facing \
  --type application \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

# Create target group
TG_ARN=$(aws elbv2 create-target-group \
  --name my-ecs-app-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# Create listener
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN

# Get the ALB DNS name
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --query 'LoadBalancers[0].DNSName' --output text)

echo "ALB URL: http://$ALB_DNS"
```

## Step 8: Create the ECS Service

```bash
aws ecs create-service \
  --cluster $ECS_CLUSTER_NAME \
  --service-name my-ecs-app-service \
  --task-definition my-ecs-app \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_1,$SUBNET_2],securityGroups=[$ECS_SG],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=my-ecs-app,containerPort=3000" \
  --health-check-grace-period-seconds 60

# Check service status
aws ecs describe-services --cluster $ECS_CLUSTER_NAME --services my-ecs-app-service \
  --query 'services[0].{status:status,running:runningCount,desired:desiredCount}'
```

Wait 2-3 minutes, then test:

```bash
curl http://$ALB_DNS
# {"message":"Hello from ECS!","env":"production"}
```

---

## Environment Variables

### Plain-text variables (in task definition)

Set directly in the `environment` array of the container definition:

```json
"environment": [
  { "name": "NODE_ENV", "value": "production" },
  { "name": "PORT", "value": "3000" },
  { "name": "LOG_LEVEL", "value": "info" }
]
```

### Secrets (from AWS Systems Manager Parameter Store)

Store secrets in SSM Parameter Store, then reference them in the task definition:

```bash
# Store a secret
aws ssm put-parameter \
  --name "/my-app/DATABASE_URL" \
  --value "postgresql://user:pass@host:5432/mydb" \
  --type SecureString

# Store another secret
aws ssm put-parameter \
  --name "/my-app/API_KEY" \
  --value "sk_live_abc123" \
  --type SecureString
```

Reference in `task-definition.json`:

```json
"secrets": [
  {
    "name": "DATABASE_URL",
    "valueFrom": "arn:aws:ssm:us-east-1:<ACCOUNT_ID>:parameter/my-app/DATABASE_URL"
  },
  {
    "name": "API_KEY",
    "valueFrom": "arn:aws:ssm:us-east-1:<ACCOUNT_ID>:parameter/my-app/API_KEY"
  }
]
```

You must also grant the execution role permission to read SSM parameters:

```bash
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess
```

---

## Auto-Scaling

Configure ECS Service Auto Scaling to adjust the number of running tasks based on CPU or memory utilization.

```bash
# Register the service as a scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/$ECS_CLUSTER_NAME/my-ecs-app-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10

# Create a target-tracking scaling policy (target 70% CPU)
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/$ECS_CLUSTER_NAME/my-ecs-app-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'
```

---

## Custom Domain

### Option A: Using Route 53

```bash
# Create a hosted zone (skip if you already have one)
aws route53 create-hosted-zone --name yourdomain.com --caller-reference $(date +%s)

# Get the hosted zone ID
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --dns-name yourdomain.com \
  --query 'HostedZones[0].Id' --output text | sed 's|/hostedzone/||')

# Create an alias record pointing to the ALB
aws route53 change-resource-record-sets --hosted-zone-id $HOSTED_ZONE_ID --change-batch '{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "api.yourdomain.com",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "<ALB_HOSTED_ZONE_ID>",
        "DNSName": "'"$ALB_DNS"'",
        "EvaluateTargetHealth": true
      }
    }
  }]
}'
```

> **Note:** The ALB hosted zone ID depends on the region. For us-east-1 it is `Z35SXDOTRQ7X7K`. See the [AWS docs](https://docs.aws.amazon.com/general/latest/gr/elb.html) for other regions.

### Option B: External DNS Provider

Add a CNAME record at your DNS provider:

| Type | Name | Value |
|------|------|-------|
| CNAME | api | `my-ecs-app-alb-123456.us-east-1.elb.amazonaws.com` |

### HTTPS with ACM

To enable HTTPS, request a free SSL certificate from AWS Certificate Manager:

```bash
# Request a certificate
CERT_ARN=$(aws acm request-certificate \
  --domain-name api.yourdomain.com \
  --validation-method DNS \
  --query 'CertificateArn' --output text)

# After DNS validation completes, add an HTTPS listener
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN

# Redirect HTTP to HTTPS
aws elbv2 modify-listener \
  --listener-arn <HTTP_LISTENER_ARN> \
  --default-actions '[{"Type":"redirect","RedirectConfig":{"Protocol":"HTTPS","Port":"443","StatusCode":"HTTP_301"}}]'
```

---

## CI/CD with GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to ECS

on:
  push:
    branches: [main]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: my-ecs-app
  ECS_CLUSTER: my-app-cluster
  ECS_SERVICE: my-ecs-app-service
  TASK_DEFINITION: task-definition.json
  CONTAINER_NAME: my-ecs-app

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v7

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v6
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build, tag, and push image to ECR
        id: build-image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

      - name: Download current task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition my-ecs-app \
            --query taskDefinition > task-definition.json

      - name: Update task definition with new image
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: ${{ env.TASK_DEFINITION }}
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

### Required GitHub Secrets

Go to your repository **Settings** > **Secrets and variables** > **Actions** and add:

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user access key ID |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret access key |

> **Tip:** For better security, use [OIDC with GitHub Actions](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) instead of long-lived credentials -- it is the approach AWS and GitHub now recommend. Add `permissions: id-token: write` to the job and pass `role-to-assume` to `configure-aws-credentials` (an IAM role trusting `token.actions.githubusercontent.com` with the `sub` claim scoped to your repo and branch, e.g. `repo:OWNER/REPO:ref:refs/heads/main`). No AWS keys stored as secrets.

---

## Deploying Updates

To deploy a new version manually (without CI/CD):

```bash
# Build, tag, and push new image
docker build -t $ECR_REPO_NAME .
docker tag $ECR_REPO_NAME:latest $ECR_URI:latest
docker push $ECR_URI:latest

# Force a new deployment (pulls latest image)
aws ecs update-service \
  --cluster $ECS_CLUSTER_NAME \
  --service my-ecs-app-service \
  --force-new-deployment

# Wait for the rollout to stabilize before calling it done
aws ecs wait services-stable \
  --cluster $ECS_CLUSTER_NAME \
  --services my-ecs-app-service
```

---

## Cost: Free Tier and Pricing

### AWS Free Tier

For AWS accounts created on or after July 15, 2025, the 12-month free tier no longer exists. New accounts choose a Free or Paid account plan and get USD $100 in credits at signup, plus up to another USD $100 for completing activities (up to $200 total). The Free plan lasts up to 6 months or until credits run out, whichever comes first -- then the account closes unless upgraded to Paid. 30+ always-free services remain, and data transfer from AWS Regions to the internet is free up to 100 GB/month for all customers.

Accounts created before July 15, 2025 keep the legacy 12-month free tier:

| Service | Free Allowance (legacy accounts only) |
|---------|---------------|
| EC2 (t2.micro/t3.micro) | 750 hours/month |
| ECS | No additional charge (pay for underlying compute) |
| ECR | 500 MB storage/month |
| ALB | 750 hours + 15 LCUs/month |
| Data Transfer | 100 GB out/month (all accounts) |

> **Important:** Fargate has no always-free allowance. On new (credits-based) accounts, the signup credits simply offset Fargate's pay-as-you-go pricing. On legacy accounts, only the EC2 launch type with a t2.micro is free-tier eligible.

### Fargate Pricing (us-east-1)

| Resource | Price |
|----------|-------|
| vCPU | ~$0.04048/hour |
| Memory | ~$0.004445/GB/hour |

**Example monthly cost** for 2 tasks (0.25 vCPU, 0.5 GB each), running 24/7:

- vCPU: 2 x 0.25 x $0.04048 x 730 hrs = ~$14.75
- Memory: 2 x 0.5 x $0.004445 x 730 hrs = ~$3.25
- ALB: ~$16.4/month ($0.0225/hour) plus LCU charges ($0.008/LCU-hour)
- Public IPv4 addresses: 4 x $0.005 x 730 hrs = ~$14.60 (2 task IPs with `assignPublicIp=ENABLED` + 2 ALB IPs across 2 AZs; AWS charges $0.005/hour per public IPv4 since February 1, 2024)
- **Total: ~$48-49/month**

Use **Fargate Spot** for non-critical workloads to save up to 70%.

---

## Troubleshooting

### Problem: Task fails to start (STOPPED status)

**Cause:** The container crashes on startup -- wrong image, missing env vars, or application error.

**Fix:**

```bash
# Check stopped task reason
aws ecs describe-tasks \
  --cluster $ECS_CLUSTER_NAME \
  --tasks $(aws ecs list-tasks --cluster $ECS_CLUSTER_NAME --service-name my-ecs-app-service --desired-status STOPPED --query 'taskArns[0]' --output text) \
  --query 'tasks[0].{stopCode:stopCode,reason:stoppedReason,containerReason:containers[0].reason}'

# Check CloudWatch logs
aws logs tail /ecs/my-ecs-app --since 30m
```

Common reasons:
- `CannotPullContainerError` -- ECR image does not exist or auth failed
- `OutOfMemoryError` -- increase `memory` in task definition
- `Essential container exited` -- application crashed, check logs

### Problem: Health check failures (unhealthy targets in ALB)

**Cause:** The health check endpoint is not responding correctly.

**Fix:**

1. Verify the health check path is correct in the target group (`/health`)
2. Ensure the app responds with HTTP 200 on the health check path
3. Check that the container port matches the target group port
4. Increase the health check grace period if the app takes time to start:

```bash
aws ecs update-service \
  --cluster $ECS_CLUSTER_NAME \
  --service my-ecs-app-service \
  --health-check-grace-period-seconds 120
```

### Problem: ECR authentication error ("no basic auth credentials")

**Cause:** Docker login to ECR has expired (tokens are valid for 12 hours).

**Fix:**

```bash
# Re-authenticate
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# If using GitHub Actions, ensure the ECR login step runs before push
```

### Problem: IAM permission denied errors

**Cause:** The IAM user or role lacks required permissions.

**Fix:**

Ensure your IAM user/role has these policies attached:

- `AmazonECS_FullAccess` (for ECS operations)
- `AmazonEC2ContainerRegistryFullAccess` (for ECR push/pull)
- `ElasticLoadBalancingFullAccess` (for ALB)
- `AmazonSSMReadOnlyAccess` (for secrets in Parameter Store)

For the ECS task execution role specifically:

```bash
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# If using SSM secrets:
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess
```

### Problem: Container logs are empty in CloudWatch

**Cause:** The log group does not exist, or the task execution role cannot write to CloudWatch.

**Fix:**

```bash
# Create the log group if it does not exist
aws logs create-log-group --log-group-name /ecs/my-ecs-app

# Verify the log configuration in your task definition matches:
# "awslogs-group": "/ecs/my-ecs-app"
# "awslogs-region": "us-east-1"
# "awslogs-stream-prefix": "ecs"
```

Also ensure `AmazonECSTaskExecutionRolePolicy` is attached to `ecsTaskExecutionRole` (this policy includes CloudWatch Logs permissions).

### Problem: Service stuck in "draining" or takes too long to deploy

**Cause:** The deregistration delay on the target group is too long, or old tasks are not shutting down.

**Fix:**

```bash
# Reduce the deregistration delay (default is 300 seconds)
aws elbv2 modify-target-group-attributes \
  --target-group-arn $TG_ARN \
  --attributes Key=deregistration_delay.timeout_seconds,Value=30

# Force new deployment
aws ecs update-service \
  --cluster $ECS_CLUSTER_NAME \
  --service my-ecs-app-service \
  --force-new-deployment
```

Ensure your app handles SIGTERM gracefully for fast shutdown:

```js
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});
```

---

## Cleanup

To tear down all resources created in this guide:

```bash
# Delete ECS service
aws ecs update-service --cluster $ECS_CLUSTER_NAME --service my-ecs-app-service --desired-count 0
aws ecs delete-service --cluster $ECS_CLUSTER_NAME --service my-ecs-app-service --force

# Delete ECS cluster
aws ecs delete-cluster --cluster $ECS_CLUSTER_NAME

# Delete ALB, target group, and listener
aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN
aws elbv2 delete-target-group --target-group-arn $TG_ARN

# Delete ECR repository (and all images)
aws ecr delete-repository --repository-name $ECR_REPO_NAME --force

# Delete security groups
aws ec2 delete-security-group --group-id $ECS_SG
aws ec2 delete-security-group --group-id $ALB_SG

# Delete log group
aws logs delete-log-group --log-group-name /ecs/my-ecs-app
```
