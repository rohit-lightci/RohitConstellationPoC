import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {Construct} from "constructs";

export type VPCStackProps = {
    cdk?: cdk.StackProps;
    environment: string;
    cidr: string;
    vpcName: string;
};

export type ExistingVPCProps = {
    vpcId: string;
    environment: string;
};

export class VPC {
    public vpc: ec2.IVpc;

    static Create(scope: Construct, id: string, props: VPCStackProps) {
        const vpc = new VPC();

        vpc.vpc = new ec2.Vpc(scope, id, {
            vpcName: `${props.vpcName}-${props.environment}`,
            ipAddresses: ec2.IpAddresses.cidr(props.cidr),
            maxAzs: 3,
            natGateways: 3,
        });

        return vpc;
    }

    static FromExisting(scope: Construct, id: string, props: ExistingVPCProps) {
        const rawVpc = ec2.Vpc.fromLookup(scope, id, {
            vpcId: props.vpcId,
        });

        const vpc = new VPC();

        vpc.vpc = rawVpc;

        return vpc;
    }
}
