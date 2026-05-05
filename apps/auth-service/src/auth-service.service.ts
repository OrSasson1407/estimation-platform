import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async generateToken(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
      teamIds: user.teamIds,
      permissions: user.permissions,
    };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async validateOAuthUser(profile: any) {
    // TODO: Integrate Prisma here to upsert the developer profile securely
    // const developer = await this.prisma.developer.upsert({ ... })

    if (!profile) {
      throw new UnauthorizedException('Invalid OAuth profile');
    }

    return this.generateToken(profile);
  }
}
