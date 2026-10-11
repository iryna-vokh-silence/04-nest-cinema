import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { Role } from '../role.enum';

/**
 * A registered user. Returned by the API as an instance of this class:
 * ClassSerializerInterceptor applies @Exclude(), so passwordHash never
 * reaches a response.
 */
@Entity('users')
@Unique('UQ_users_email', ['email'])
@Check('CHK_users_role', `"role" IN ('user', 'admin')`)
export class User {
  @ApiProperty({
    format: 'uuid',
    example: '6c3f1f7e-2a4b-4c8d-9e1f-0a1b2c3d4e5f',
  })
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_users' })
  id: string;

  /** Stored trimmed and in lower case; unique. */
  @ApiProperty({ example: 'user@example.com' })
  @Column({ type: 'varchar' })
  email: string;

  /** bcrypt hash. Never serialized. */
  @Exclude()
  @Column({ name: 'password_hash', type: 'varchar' })
  passwordHash: string;

  @ApiProperty({ enum: Role, example: Role.User })
  @Column({ type: 'varchar', default: Role.User })
  role: Role;

  @ApiProperty({ example: '2030-01-01T10:00:00.000Z' })
  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt: Date;

  @Exclude()
  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens?: RefreshToken[];

  constructor(partial?: Partial<User>) {
    if (partial) Object.assign(this, partial);
  }
}
