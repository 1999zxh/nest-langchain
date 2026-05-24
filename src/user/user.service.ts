import { Injectable } from '@nestjs/common';
import { CreateUserDto, QueryUserDto, UpdateUserDto } from './dto/user.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const user = await this.prisma.user.create({
      data: createUserDto,
    });
    return {
      success: true,
      message: `用户${user.name}`,
      data: user,
    };
  }
  async getUserlist() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      success: true,
      message: `用户列表`,
      total: users.length,
      data: users,
    };
  }
  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        posts: {
          select: {
            id: true,
            title: true,
            content: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!user) {
      return {
        success: false,
        message: `用户不存在`,
      };
    }
    return {
      success: true,
      data: user,
    };
  }
  deleteUser(id: string) {
    return this.prisma.user
      .delete({
        where: { id: parseInt(id) },
      })
      .then((user) => {
        return {
          success: true,
          message: `用户${user.name}已删除`,
        };
      })
      .catch((error) => {
        return {
          success: false,
          message: error.message,
        };
      });
  }
  updateUser(updateUserDto: UpdateUserDto) {
    const { id, ...data } = updateUserDto;
    return this.prisma.user
      .update({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
        data,
      })
      .then((user) => {
        return {
          success: true,
          message: `用户${user.name}已更新`,
          data: user,
        };
      })
      .catch((error) => {
        return {
          success: false,
          message: error.message,
        };
      });
  }
  searchUser(queryUserDto: QueryUserDto) {
    const { page = '1', pageSize = '10', ...filters } = queryUserDto;
    const where = Object.entries(filters).reduce((acc, [key, value]) => {
      if (value) {
        acc[key] = value;
      }
      return acc;
    }, {});
    return this.prisma
      .$transaction([
        this.prisma.user.count({ where }), //获取总数
        this.prisma.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          skip: (parseInt(page) - 1) * parseInt(pageSize),
          take: parseInt(pageSize),
        }),
      ])
      .then(([total, users]) => {
        return {
          success: true,
          message: `搜索结果`,
          total,
          totalPage: Math.ceil(total / parseInt(pageSize)),
          currentPage: parseInt(page),
          data: users,
        };
      })
      .catch((error) => {
        return {
          success: false,
          message: error.message,
        };
      });
  }
}
