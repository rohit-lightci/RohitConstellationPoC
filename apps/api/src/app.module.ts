import { Module } from "@nestjs/common";
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { databaseConfig } from './config/database.config';
import { HealthcheckModule } from "./healthcheck/healthcheck.module";
import { SessionModule } from './session/session.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        TypeOrmModule.forRoot(databaseConfig),
        HealthcheckModule,
        SessionModule
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
