import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './authenticated-user';
import { Auth } from './decorators/auth.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { TokensDto } from './dto/tokens.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Register a user (role is always "user")',
    description: 'A "role" field in the body is ignored.',
  })
  @ApiCreatedResponse({
    type: User,
    description: 'Created user (without password and its hash)',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Invalid email or password shorter than 8 characters',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'User with this email already exists',
  })
  register(@Body() dto: RegisterDto): Promise<User> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in: returns an access + refresh token pair' })
  @ApiOkResponse({ type: TokensDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'email or password missing',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'Wrong email or wrong password (the same message in both cases)',
  })
  login(@Body() dto: LoginDto): Promise<TokensDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new pair (rotation)',
    description:
      'The old refresh token is consumed atomically (DELETE ... RETURNING) and is no longer valid.',
  })
  @ApiOkResponse({ type: TokensDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'refreshToken missing',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Refresh token not found, expired or already used',
  })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokensDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auth()
  @ApiOperation({ summary: 'Revoke a refresh token of the current user' })
  @ApiNoContentResponse({ description: 'Refresh token revoked' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'refreshToken missing',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description:
      'Refresh token does not exist or belongs to another user (only own tokens can be revoked)',
  })
  logout(
    @CurrentUser('id') userId: string,
    @Body() dto: RefreshTokenDto,
  ): Promise<void> {
    return this.authService.logout(userId, dto.refreshToken);
  }

  @Get('me')
  @Auth()
  @ApiOperation({ summary: 'Current user' })
  @ApiOkResponse({ type: User })
  me(@CurrentUser() user: AuthenticatedUser): Promise<User> {
    return this.authService.me(user.id);
  }
}
