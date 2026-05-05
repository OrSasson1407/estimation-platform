import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth-service.service';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: Record<string, any>) {
    // Mock user matching the required JWT payload structure[cite: 2]
    // We will connect this to the real Prisma DB shortly
    const mockUser = {
      id: 'user_abc123',
      email: 'dev@company.com',
      role: 'ENGINEERING_MANAGER',
      orgId: 'org_xyz456',
      teamIds: ['team_001'],
      permissions: ['estimates:read', 'sprints:write'],
    };

    return this.authService.generateToken(mockUser);
  }
}
