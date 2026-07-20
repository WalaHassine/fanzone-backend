import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /**
   * Swagger / OpenAPI documentation.
   *
   * Exposes DTO schemas together with their class-validator rules (minLength,
   * pattern, format) at /api/docs. Disabled in production to avoid publishing
   * the API surface.
   */
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('World Cup FanZone AI')
      .setDescription(
        'Smart Fan Zone Recommendation Platform for the FIFA World Cup',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
