import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Shared application configuration. Used by main.ts and by e2e tests,
 * so the tests run against exactly the same validation setup.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      // One message per invalid property, e.g. a missing field reports only
      // "x should not be null or undefined" instead of every failing rule.
      stopAtFirstError: true,
    }),
  );
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Cinema API')
    .setDescription(
      'Films, halls, showings and seat bookings. Data is stored in PostgreSQL ' +
        '(TypeORM, schema created by migrations). Every error response has the ' +
        'shape { statusCode, message, error, path, timestamp }.\n\n' +
        'Authentication: POST /auth/login returns an access token; press ' +
        '"Authorize" and paste it. Routes with a lock need it (401 without it); ' +
        'administrator routes answer 403 for the role "user".',
    )
    .setVersion('4.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Access token from POST /auth/login or /auth/refresh',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
