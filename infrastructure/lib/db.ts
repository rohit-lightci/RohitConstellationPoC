import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import {Secret} from "aws-cdk-lib/aws-secretsmanager";
import {Construct} from "constructs";

import {VPC} from "./vpc";

export type DBInstanceType = {
    instanceSize: ec2.InstanceSize;
    instanceClass: ec2.InstanceClass;
};

export type RDSStackProps = {
    cdk?: cdk.StackProps;
    environment: string;
    vpc: VPC;
    defaultDatabaseName: string;
    dbUsername: string;
    writerInstanceConfig?: DBInstanceType;
    readerInstanceConfig?: DBInstanceType[];
};

export class RDS {
    defaultDatabaseName: string;
    environment: string;
    refId: string;
    VPC: VPC;
    DBSecret: Secret;
    DBSecurityGroup: ec2.SecurityGroup;
    DBCluster: rds.DatabaseCluster;

    constructor(
        public scope: Construct,
        id: string,
        props: RDSStackProps
    ) {
        this.refId = `${props.cdk?.stackName}-${id}`;
        this.environment = props.environment;
        this.defaultDatabaseName = props.defaultDatabaseName;
        this.VPC = props.vpc;

        this.createDatabaseCredentials(props.dbUsername);
        this.createDatabaseSecurityGroup();
        this.createDBCluster(
            props.writerInstanceConfig ?? {instanceSize: ec2.InstanceSize.MEDIUM, instanceClass: ec2.InstanceClass.T3},
            props.readerInstanceConfig
        );
    }

    createDatabaseCredentials(dbUsername: string) {
        this.DBSecret = new Secret(this.scope, `${this.refId}-${this.environment}-secret`, {
            secretName: `${this.refId}-${this.environment}-secret`,
            generateSecretString: {
                secretStringTemplate: JSON.stringify({username: dbUsername}),
                generateStringKey: "password",
                passwordLength: 30,
                excludePunctuation: true,
            },
        });
    }

    createDatabaseSecurityGroup() {
        this.DBSecurityGroup = new ec2.SecurityGroup(this.scope, `${this.refId}-sg`, {
            securityGroupName: `${this.refId}-${this.environment}-sg`,
            vpc: this.VPC.vpc,
        });

        this.DBSecurityGroup.addIngressRule(ec2.Peer.ipv4(this.VPC.vpc.vpcCidrBlock), ec2.Port.tcp(5432));
    }

    createDBCluster(
        writerInstanceConfig: DBInstanceType = {
            instanceSize: ec2.InstanceSize.MEDIUM,
            instanceClass: ec2.InstanceClass.T3,
        },
        readerInstanceConfig?: DBInstanceType[]
    ) {
        this.DBCluster = new rds.DatabaseCluster(this.scope, `${this.refId}-db-cluster`, {
            clusterIdentifier: `${this.refId}-${this.environment}-db-cluster`,
            defaultDatabaseName: this.defaultDatabaseName,
            engine: rds.DatabaseClusterEngine.auroraPostgres({
                version: rds.AuroraPostgresEngineVersion.VER_16_6,
            }),
            backup: {
                retention: cdk.Duration.days(14),
            },
            iamAuthentication: true,
            copyTagsToSnapshot: true,
            cloudwatchLogsExports: ["postgresql"],
            cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
            vpc: this.VPC.vpc,
            securityGroups: [this.DBSecurityGroup],
            writer: rds.ClusterInstance.provisioned("writer", {
                instanceType: ec2.InstanceType.of(
                    writerInstanceConfig.instanceClass,
                    writerInstanceConfig.instanceSize
                ),
            }),
            readers: readerInstanceConfig
                ? readerInstanceConfig.map((readerInstanceConfig) => {
                      return rds.ClusterInstance.provisioned("reader", {
                          instanceType: ec2.InstanceType.of(
                              readerInstanceConfig.instanceClass,
                              readerInstanceConfig.instanceSize
                          ),
                      });
                  })
                : undefined,
            credentials: rds.Credentials.fromSecret(this.DBSecret),
        });
    }
}
