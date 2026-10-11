import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Film } from './entities/film.entity';
import { FilmsController } from './films.controller';
import { FilmsService } from './films.service';

@Module({
  imports: [TypeOrmModule.forFeature([Film])],
  controllers: [FilmsController],
  providers: [FilmsService],
  exports: [FilmsService],
})
export class FilmsModule {}
