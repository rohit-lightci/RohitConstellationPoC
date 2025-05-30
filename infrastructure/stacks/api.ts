import * as path from "path";

import * as cdk from "aws-cdk-lib";
import * as certs from "aws-cdk-lib/aws-certificatemanager";
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as pattern from 'aws-cdk-lib/aws-ecs-patterns';
import * as Route53 from "aws-cdk-lib/aws-route53";
import {Construct} from "constructs";

import { attachEnvironmentName } from "../config/getConfig";
import {EnvironmentConfig} from "../lib/config";
import {RDS} from "../lib/db";
import {VPC} from "../lib/vpc";


type StackProps = cdk.StackProps & EnvironmentConfig;

export class ApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const vpc = VPC.FromExisting(this, "VPC", {
            vpcId: props.vpcId,
            environment: props.environment,
        });

        const db = new RDS(this, "rohit-constellation-db", {
            cdk: props,
            vpc,
            environment: props.environment,
            defaultDatabaseName: props.database.name,
            dbUsername: process.env.DB_USERNAME || "admin",
        });

        const wildcardSSLCert = certs.Certificate.fromCertificateArn(this, "wildcard-ssl-cert", props.domain.sslCertArn);

        const hostedZone = Route53.HostedZone.fromHostedZoneAttributes(this, props.domain.zoneName, {
            hostedZoneId: props.domain.hostedZoneId,
            zoneName: props.domain.zoneName,
        });
        

        const apiDockerFile = path.join(__dirname, '..', '..')
        const dockerfilePath = path.join('apps', 'api', 'Dockerfile')

        const apiService = new pattern.ApplicationLoadBalancedFargateService(this, 'api-handler', {
            vpc: vpc.vpc,
            memoryLimitMiB: 2048,
            cpu: 1024,
            securityGroups: [db.DBSecurityGroup],
            desiredCount: 1,
            taskImageOptions: {
              image: ecs.ContainerImage.fromAsset(apiDockerFile, {
                platform: ecrAssets.Platform.LINUX_AMD64,
                file: dockerfilePath,
              }),
              secrets: {
                DB: ecs.Secret.fromSecretsManager(db.DBSecret),
              },
              environment: {
                NODE_ENV: props.environment,
                DISABLE_LAMBDA: "true",
                OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
                // PINECONE_API_KEY: process.env.PINECONE_API_KEY ?? "",
                // PINECONE_CONTROLLER_HOST_URL: process.env.PINECONE_CONTROLLER_HOST_URL ?? "",
              },
              containerName: "rohit-constellation-api",
              containerPort: 3000,
            },
            loadBalancerName: attachEnvironmentName("rohit-constellation-api", props),
            domainName: props.domain.domainName,
            domainZone: hostedZone,
            certificate: wildcardSSLCert,
            publicLoadBalancer: true
          });


          apiService.targetGroup.configureHealthCheck({
            path: "/health",
          });
    }
}
