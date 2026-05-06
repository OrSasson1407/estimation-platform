// apps/auth-service/src/auth-service.controller.ts  ← UPDATED: Zod validation + real login
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth-service.service';
import { ZodValidationPipe } from './zod-validation.pipe';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const ApiKeySchema = z.object({
  apiKey: z.string().min(32),
});

type LoginDto = z.infer<typeof LoginSchema>;

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return this.authService.generateToken(user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }
}
