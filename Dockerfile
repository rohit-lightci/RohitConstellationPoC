# Use Node.js LTS version
FROM node:20-slim

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy root workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./

# Copy the shared packages
COPY packages/tsconfig ./packages/tsconfig
COPY packages/types ./packages/types

# Copy the API package
COPY apps/api ./apps/api

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the types package first
RUN cd packages/types && pnpm build

# Build the API
RUN cd apps/api && pnpm build

# Set the working directory to the API
WORKDIR /app/apps/api

# Expose the port the app runs on
EXPOSE 3000

# Run migrations and start the API
CMD ["sh", "-c", "pnpm db:migrate && pnpm start:prod"] 