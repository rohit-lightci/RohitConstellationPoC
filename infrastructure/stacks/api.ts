import * as cdk from "aws-cdk-lib";
import {Construct} from "constructs";

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

        new RDS(this, "DB", {
            vpc,
            environment: props.environment,
            defaultDatabaseName: props.database.name,
            dbUsername: process.env.DB_USERNAME || "admin",
        });
    }
}
