// apps/auth-service/src/auth-service.service.ts  ← UPDATED: Prisma + bcrypt + real RBAC
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { prisma } from '@estimation/database';
import * as bcrypt from 'bcrypt';

// Permission map per role — enforces the RBAC matrix from the spec
const ROLE_PERMISSIONS: Record<string, string[]> = {
  EXECUTIVE: [
    'estimates:read',
    'simulations:run',
    'developers:read_aggregated',
    'stakeholder:view',
    'rbac:manage',
    'cost:read',
  ],
  ENGINEERING_MANAGER: [
    'estimates:read',
    'estimates:override',
    'simulations:run',
    'developers:read_team',
    'integrations:configure',
    'stakeholder:view',
    'cost:read',
  ],
  TEAM_LEAD: [
    'estimates:read_team',
    'estimates:override',
    'simulations:run',
    'developers:read_own_team',
  ],
  DEVELOPER: ['estimates:read_own', 'developers:read_own'],
  STAKEHOLDER: ['stakeholder:view'],
};

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async validateUser(email: string, password: string) {
    const developer = await prisma.developer.findUnique({ where: { email } });
    if (!developer) return null;

    // NOTE: In production the password hash is stored on a separate User model.
    // Using developer record here for simplicity — extend with a User model per ADR.
    const isValid = await bcrypt.compare(password, (developer as any).passwordHash ?? '');
    if (!isValid) return null;

    return developer;
  }

  async generateToken(user: { id: string; email: string; role: string; orgId: string }) {
    // Fetch team memberships for JWT teamIds claim
    const memberships = await prisma.teamMember.findMany({
      where: { developerId: user.id },
      select: { teamId: true },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
      teamIds: memberships.map((m) => m.teamId),
      permissions: ROLE_PERMISSIONS[user.role] ?? [],
    };

    return {
      access_token: this.jwtService.sign(payload),
      token_type: 'Bearer',
      expires_in: 3600,
    };
  }

  async refreshToken(token: string) {
    try {
      const decoded = this.jwtService.verify(token);
      const user = await prisma.developer.findUnique({ where: { id: decoded.sub } });
      if (!user) throw new UnauthorizedException();
      return this.generateToken(user);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
