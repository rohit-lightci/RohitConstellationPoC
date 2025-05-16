import {Module} from "@nestjs/common";
import {ConfigModule} from "@nestjs/config";

import {AppController} from "./app.controller";
import {AppService} from "./app.service";
import {HealthcheckModule} from "./healthcheck/healthcheck.module";

@Module({
    imports: [ConfigModule.forRoot(), HealthcheckModule],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
