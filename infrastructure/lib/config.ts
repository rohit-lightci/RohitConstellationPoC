import {readFileSync} from "fs";
import {join} from "path";

import * as cdk from "aws-cdk-lib";

export interface EnvironmentConfig {
    environment: Environment;
    stackName: string;
    datadogApiKeySecretArn: string;
    vpcId: string;
    domain: {
        zoneName: string;
        hostedZoneId: string;
        domainName: string;
        sslCertArn: string;
    };
    database: {
        name: string;
        snapshotArn?: string;
    };
}

export enum Environment {
    Development = "development",
    Production = "production",
}

export default function getConfig(app: cdk.App): EnvironmentConfig {
    const env = app.node.getContext("config");

    if (!env) {
        throw new Error("Missing config param. Please pass in `-c config=<env>`");
    }

    try {
        const configFile = readFileSync(join(__dirname, "..", "config", `${env}.json`), "utf8");
        return JSON.parse(configFile) as EnvironmentConfig;
    } catch (error) {
        console.error(error);
        throw new Error(`Missing environment config file: ${env}`);
    }
}

export function attachEnvironmentName(str: string, config: EnvironmentConfig): string {
    if (config.environment === Environment.Production) {
        return str;
    } else if (config.environment === Environment.Development) {
        if (str.endsWith(".fifo")) {
            // split the string and append dev before the .fifo prefix
            return `${str.split(".fifo")[0]}-dev.fifo`;
        } else {
            return `${str}-dev`;
        }
    }

    return `${config.environment}-${str}`;
}
