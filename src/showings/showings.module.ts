import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilmsModule } from '../films/films.module';
import { HallsModule } from '../halls/halls.module';
import { Showing } from './entities/showing.entity';
import { ShowingsController } from './showings.controller';
import { ShowingsService } from './showings.service';

@Module({
  imports: [TypeOrmModule.forFeature([Showing]), FilmsModule, HallsModule],
  controllers: [ShowingsController],
  providers: [ShowingsService],
  exports: [ShowingsService],
})
export class ShowingsModule {}
