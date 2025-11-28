import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { GoogleUser } from '../types/request.types';

@Injectable()
export class AuthService {
  private readonly prisma: PrismaService;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
  }

  async register(registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(registerDto.password, salt);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password_hashed: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });

    return {
      user,
    };
  }

  async login(loginDto: LoginDto) {
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password_hashed,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        // levelPlaced: user.levelPlaced, // This will be null for new users
      },
    };
  }

  async validateGoogleUser(details: GoogleUser): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email: details.email },
    });

    if (user) {
      // Update user with Google ID if not present
      if (!user.googleId) {
        return await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId: details.googleId },
        });
      }
      return user;
    }

    // Create new user if doesn't exist
    const newUser = await this.prisma.user.create({
      data: {
        email: details.email,
        googleId: details.googleId,
        password_hashed: '', // Empty as Google auth doesn't need password
      },
    });

    return newUser;
  }

  async googleLogin(user: {
    id: number;
    email: string;
    levelPlaced: number | null;
  }): Promise<{
    user: { id: number; email: string; levelPlaced: number | null };
  }> {
    if (!user) {
      throw new UnauthorizedException('No user from Google');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        levelPlaced: user.levelPlaced,
      },
    };
  }

  async logout(): Promise<{ message: string }> {
    // In a JWT-based auth system, logout is typically handled client-side
    // by removing the token. However, we can perform server-side cleanup here.

    // For now, we'll just return a success message
    // In the future, you might want to:
    // 1. Add token blacklisting
    // 2. Clear any active sessions
    // 3. Log the logout event

    return {
      message: 'Successfully logged out',
    };
  }
}
