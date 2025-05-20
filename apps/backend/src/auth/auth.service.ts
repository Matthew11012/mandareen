import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

interface GoogleUser {
  email: string;
  googleId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

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

    // Generate JWT token
    const token = this.jwtService.sign({ 
      sub: user.id,
      email: user.email 
    });

    return {
      user,
      token,
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

    // Generate JWT token
    const token = this.jwtService.sign({ 
      sub: user.id,
      email: user.email 
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        // levelPlaced: user.levelPlaced, // This will be null for new users
      },
      token,
    };
  }

  async validateGoogleUser(details: GoogleUser) {
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

  async googleLogin(user: any) {
    if (!user) {
      throw new UnauthorizedException('No user from Google');
    }

    // Generate JWT token
    const token = this.jwtService.sign({ 
      sub: user.id,
      email: user.email 
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        levelPlaced: user.levelPlaced,
      },
      token,
    };
  }
} 