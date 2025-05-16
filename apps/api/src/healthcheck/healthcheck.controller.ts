import {Controller, Get} from "@nestjs/common";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";

import {HealthResponse} from "./health-response.dto";
import {HealthcheckService} from "./healthcheck.service";

@ApiTags("Healthcheck")
@Controller("health")
export class HealthcheckController {
    constructor(private readonly healthcheckService: HealthcheckService) {}

    @Get()
    @ApiOperation({summary: "Get application health status"})
    @ApiResponse({
        status: 200,
        description: "Application is healthy",
        type: HealthResponse,
    })
    getHealth(): HealthResponse {
        return this.healthcheckService.getHealth();
    }
}
