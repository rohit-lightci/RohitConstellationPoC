# TypeScript Monorepo with pnpm and Turborepo

This is a monorepo setup using pnpm workspaces and Turborepo.

## Structure

- `/apps/*` - Applications
  - `/apps/api` - Example API using Nest.js
- `/packages/*` - Shared packages
  - `/packages/tsconfig` - Shared TypeScript configurations
- `/infrastructure` - AWS CDK infrastructure code

## Features

- **pnpm Workspaces**: Manages dependencies across multiple packages
- **Turborepo**: Optimizes the build system for monorepos
- **Husky**: Runs Git hooks to ensure code quality
- **lint-staged**: Runs linters on staged git files
- **GitHub Workflows**: Automated CI processes for pull requests
- **AWS CDK**: Infrastructure as Code for AWS cloud resources

## Getting Started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Run development server:

   ```bash
   pnpm dev
   ```

3. Build all packages:
   ```bash
   pnpm build
   ```

## Commands

- `pnpm dev` - Run development servers for all apps
- `pnpm build` - Build all apps and packages
- `pnpm lint` - Lint all apps and packages
- `pnpm test` - Run tests for all apps and packages
- `pnpm format` - Format code with Prettier

### Infrastructure Commands

- `pnpm cdk -- -c config=<env> <command>` - Run any CDK command (e.g., `pnpm cdk -- -c config=dev list`)
- `pnpm cdk:bootstrap -- -c config=<env>` - Bootstrap your AWS environment for CDK
- `pnpm cdk:synth -- -c config=<env>` - Synthesize CloudFormation templates
- `pnpm cdk:deploy -- -c config=<env>` - Deploy infrastructure to AWS
- `pnpm cdk:diff -- -c config=<env>` - Show differences between local and deployed stack
- `pnpm cdk:destroy -- -c config=<env>` - Destroy deployed infrastructure

## Infrastructure Deployment

The project uses AWS CDK to define and deploy infrastructure.

### Prerequisites

- AWS CLI installed and configured with appropriate credentials
- AWS account and region configured

### Configuration

All CDK commands require a configuration parameter that specifies the environment:

```bash
-c config=<env>
```

Where `<env>` is the environment name (e.g., dev, staging, prod).

### Deployment Steps

These commands can be run either from the root or from the infrastructure folder.

1. Bootstrap your AWS environment (first-time only):

   ```bash
   pnpm cdk bootstrap -c config=development
   ```

2. Synthesize the CloudFormation templates:

   ```bash
   pnpm cdk synth -c config=development
   ```

3. Deploy the infrastructure:

   ```bash
   pnpm cdk deploy -c config=development
   ```

4. To remove all deployed resources:
   ```bash
   pnpm cdk destroy -c config=development
   ```

## Code Quality

This project uses:

- **Husky**: Automatically runs lint-staged on pre-commit
- **lint-staged**: Runs ESLint and Prettier on staged files before commit

## Continuous Integration

GitHub Actions workflows run on all pull requests to the main branch:

- **Linting**: Ensures code meets quality standards by running `pnpm lint`

## Secrets Management

The infrastructure deployment requires certain secrets to be configured. At minimum, you will need the following secrets that are defined in `.github/workflows/cicd.yml`:

- **AWS_ACCESS_KEY_ID**: Your AWS access key with permissions to deploy resources
- **AWS_SECRET_ACCESS_KEY**: Your AWS secret access key
- **AWS_REGION**: The AWS region to deploy to
- **OPENAI_API_KEY**: API key for OpenAI services (if your application uses OpenAI)

### Setting Up Secrets

#### For Local Development

Store these secrets as environment variables:

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=your_region
export OPENAI_API_KEY=your_openai_key
```

You can create a `.env` file in the project root (make sure it's in `.gitignore`) and load it using a tool like `dotenv`.

#### For GitHub Actions

Configure these secrets in your GitHub repository:

1. Go to your repository settings
2. Navigate to "Secrets and variables" → "Actions"
3. Add each required secret

These secrets will be securely accessed during the CI/CD pipeline when deploying to AWS.
