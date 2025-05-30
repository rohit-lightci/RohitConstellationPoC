import { Environment, EnvironmentConfig } from "../lib/config";



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