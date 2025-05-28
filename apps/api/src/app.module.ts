import { Module } from "@nestjs/common";
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { databaseConfig } from './config/database.config';
import { EmbeddingModule } from './embedding/embedding.module';
import { HealthcheckModule } from "./healthcheck/healthcheck.module";
import { LLMModule } from './llm/llm.module';
import { SessionModule } from './session/session.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        TypeOrmModule.forRoot(databaseConfig),
        EmbeddingModule,
        HealthcheckModule,
        SessionModule,
        LLMModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
