import {Injectable, Logger} from "@nestjs/common";

import {version} from "../../package.json";

@Injectable()
export class HealthcheckService {
    logger = new Logger(HealthcheckService.name);
    getHealth() {
        try {
            return {
                status: "ok",
                version,
            };
        } catch (error) {
            this.logger.error(error);
            return {
                status: "ok",
                version: "unknown",
            };
        }
    }
}
