import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Showing } from '../../showings/entities/showing.entity';

@Entity('films')
export class Film {
  @ApiProperty({
    format: 'uuid',
    example: '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f7a8b9c',
  })
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_films' })
  id: string;

  @ApiProperty({ example: 'Interstellar' })
  @Column({ type: 'varchar' })
  title: string;

  @ApiProperty({ type: 'integer', example: 169, minimum: 1 })
  @Column({ name: 'duration_minutes', type: 'integer' })
  durationMinutes: number;

  @ApiProperty({ type: 'integer', example: 2014 })
  @Column({ name: 'release_year', type: 'integer' })
  releaseYear: number;

  /** Not loaded by default and not part of the API response. */
  @OneToMany(() => Showing, (showing) => showing.film)
  showings?: Showing[];
}
