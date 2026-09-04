import { PrismaClient, User as PrismaUser, UserStatus as PrismaUserStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "../config/database";
import { User, UserStatus } from "../types/auth";

function mapPrismaUserToUser(pUser: PrismaUser): User {
  return {
    id: pUser.id,
    phone: pUser.phone ?? undefined,
    email: pUser.email ?? undefined,
    phoneVerified: Boolean(pUser.phoneVerifiedAt),
    emailVerified: Boolean(pUser.emailVerifiedAt),
    status: pUser.status as UserStatus,
    createdAt: pUser.createdAt,
    updatedAt: pUser.updatedAt,
  };
}

export class UserRepository {
  constructor(private prisma: PrismaClient = defaultPrisma) {}

  async findByPhone(phone: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { phone },
    });
    return user ? mapPrismaUserToUser(user) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    return user ? mapPrismaUserToUser(user) : null;
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    return user ? mapPrismaUserToUser(user) : null;
  }

  async create(data: {
    phone?: string;
    email?: string;
    phoneVerified?: boolean;
    emailVerified?: boolean;
  }): Promise<User> {
    const now = new Date();
    const user = await this.prisma.user.create({
      data: {
        phone: data.phone ?? null,
        email: data.email ? data.email.toLowerCase() : null,
        phoneVerifiedAt: data.phoneVerified ? now : null,
        emailVerifiedAt: data.emailVerified ? now : null,
        status: PrismaUserStatus.ACTIVE,
      },
    });
    return mapPrismaUserToUser(user);
  }
}

export const userRepository = new UserRepository();
