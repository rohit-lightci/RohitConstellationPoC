<p align="center">
  <img src="../../docs/assets/lci-logo.png" width="200" alt="LightCI Logo" />
</p>

# LightCI API

A robust and scalable REST API built with [NestJS](https://nestjs.com) framework. This API serves as the backend for the LightCI platform, providing endpoints for automation, continuous integration, and deployment services.

## Description

This API project is part of the LightCI ecosystem, built using NestJS - a progressive Node.js framework for building efficient and scalable server-side applications. The API follows best practices for enterprise-grade applications, including modular architecture, dependency injection, and a robust testing strategy.

## Project Setup

```bash
# Install dependencies
$ pnpm install
```

## Compile and Run the Project

```bash
# Development mode
$ pnpm run start

# Watch mode (recommended for development)
$ pnpm run dev

# Production mode
$ pnpm run start:prod
```

The API server will be running at `http://localhost:3000` by default, or on the port specified in your environment variables.

## API Documentation

The API includes comprehensive Swagger documentation for all endpoints. Once the application is running, you can access the interactive API documentation at:

```
http://localhost:3000/docs
```

This documentation provides:

- Detailed information about all available endpoints
- Request and response schemas
- The ability to test API calls directly from the browser

## API Versioning

This API uses URI-based versioning to ensure backward compatibility as the API evolves:

- All API routes are prefixed with a version number (e.g., `/v1/users`)
- The current default version is `v1`
- When making requests, you can explicitly specify the API version in the URL path

This versioning scheme allows us to introduce breaking changes in newer versions while maintaining support for existing clients using older versions.

## Run Tests

```bash
# Unit tests
$ pnpm run test

# E2E tests
$ pnpm run test:e2e

# Test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).

## Support

For issues, feature requests, or questions about the API, please create an issue in the project repository.

If you have a problen with this particular project, please tag @aneglo-lightci
