import {ConsoleLogger, VersioningType} from "@nestjs/common";
import {NestFactory} from "@nestjs/core";
import {DocumentBuilder, SwaggerModule} from "@nestjs/swagger";

import {AppModule} from "./app.module";
async function bootstrap() {
    const logger = new ConsoleLogger("NestApplication", {
        timestamp: true,
        json: process.env.NODE_ENV === "production",
    });

    const app = await NestFactory.create(AppModule, {
        logger,
    });

    app.enableVersioning({
        type: VersioningType.URI,
        defaultVersion: "1",
    });

    const config = new DocumentBuilder().setTitle("API").setDescription("API description").setVersion("1.0").build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("docs", app, document);
    await app.listen(process.env.PORT ?? 3000);

    logger.log(`Server is running on port ${process.env.PORT ?? 3000}`);
}

bootstrap();
