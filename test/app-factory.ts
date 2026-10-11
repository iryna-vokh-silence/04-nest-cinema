import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp, setupSwagger } from '../src/app.setup';

/** Creates the application exactly like main.ts does, on a random port. */
export async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  setupSwagger(app);
  // A real port: parallel supertest requests then share one server.
  await app.listen(0);
  return app;
}
