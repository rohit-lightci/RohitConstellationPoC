#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import getConfig from "../lib/config";
import {ApiStack} from "../stacks/api";

const app = new cdk.App();

const config = getConfig(app);

new ApiStack(app, "ApiStack", {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
    ...config,
});
