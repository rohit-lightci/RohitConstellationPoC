# Infrastructure Guide for Backend Developers

This directory contains the AWS CDK (Cloud Development Kit) infrastructure code for our application. This guide will help you understand how to work with our infrastructure, even if you don't have much experience with CDK.

## What is AWS CDK?

AWS CDK lets you define cloud infrastructure using TypeScript code instead of writing CloudFormation YAML/JSON directly. It's more maintainable and allows us to use programming concepts like loops, conditionals, and reusable components.

## Project Structure

- `/infrastructure/bin/` - Entry point for CDK application
- `/infrastructure/lib/` - Reusable infrastructure components
- `/infrastructure/stacks/` - Stack definitions (like API, database, etc.)
- `/infrastructure/config/` - Environment configuration files

## Environment Configuration

We use configuration files to manage different environments (development, staging, production).

### Available Environments

Configuration files are stored in the `config/` directory as JSON files:

- `development.json` - Development environment
- `staging.json` - Staging environment
- `production.json` - Production environment

### Creating a New Environment

To create a new environment (e.g., "demo"):

1. Create a new file in the `config/` directory named `demo.json`
2. Use the following template, adjusting values as needed:

```json
{
    "name": "demo",
    "region": "us-east-1",
    "account": "YOUR_AWS_ACCOUNT_ID",
    "vpcId": "vpc-XXXXXXXX",
    "database": {
        "name": "app_demo"
    }
}
```

Replace the placeholder values with your actual AWS account ID, desired region, and VPC ID. The database name will be used when creating the RDS instance.

## Common Commands

All commands should be run from either the project root or the infrastructure directory.

### Listing Available Stacks

```bash
pnpm cdk list -c config=development
```

### Synthesizing CloudFormation Templates

This generates the CloudFormation templates without deploying:

```bash
pnpm cdk synth -c config=development
```

### Deploying the Infrastructure

Deploy all stacks:

```bash
pnpm cdk deploy -c config=development
```

Deploy a specific stack:

```bash
pnpm cdk deploy ApiStack -c config=development
```

### Checking Differences

Before deploying, you can see what changes will be made:

```bash
pnpm cdk diff -c config=development
```

### Destroying Infrastructure

To remove deployed resources (be careful in production!):

```bash
pnpm cdk destroy -c config=development
```

## Important Notes

- **Always** include the `-c config=<environment>` parameter with your CDK commands
- The environment name must match a JSON file in the config directory
- Different environments can have different AWS accounts and regions
- The first time you use CDK in a new AWS account/region, you need to bootstrap:
    ```bash
    pnpm cdk bootstrap -c config=development
    ```

## Troubleshooting

### Common Issues

1. **Missing configuration file**: Make sure the environment name in your `-c config=<env>` parameter matches an existing JSON file in the config directory.

2. **AWS credentials**: Ensure you have valid AWS credentials configured for the account specified in your config file.

3. **VPC not found**: Verify the VPC ID in your configuration file exists in the specified AWS account and region.

4. **Bootstrap error**: If you get a bootstrap error, run the bootstrap command as shown above.

## Extending Infrastructure

When adding new AWS resources:

1. Create reusable constructs in the `lib/` directory
2. Import and use these constructs in your stack definitions in the `stacks/` directory
3. Update the configuration schema if new parameters are needed
