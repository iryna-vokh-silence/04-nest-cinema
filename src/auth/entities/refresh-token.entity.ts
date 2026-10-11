import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * One issued refresh token = one row (a user may be logged in on several
 * devices). Only the SHA-256 hash of the token is stored: a leaked database
 * does not let anyone log in with somebody else's token.
 */
@Entity('refresh_tokens')
@Index('IDX_refresh_tokens_user_id', ['userId'])
@Unique('UQ_refresh_tokens_token_hash', ['tokenHash'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_refresh_tokens',
  })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** Deleting a user deletes their refresh tokens. */
  @ManyToOne(() => User, (user) => user.refreshTokens, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_refresh_tokens_user_id',
  })
  user?: User;

  /** hex SHA-256 of the token (deterministic, so it can be looked up). */
  @Column({ name: 'token_hash', type: 'varchar' })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt: Date;
}
