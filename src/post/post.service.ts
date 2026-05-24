import { Injectable } from '@nestjs/common';
import { CreatePostDto } from './dto/post.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PostService {
  constructor(private readonly prisma: PrismaService) {}
  async create(createPostDto: CreatePostDto) {
    const post = await this.prisma.post.create({
      data: {
        title: createPostDto.title,
        content: createPostDto.content,
        published: createPostDto.published ?? false,
        authorId: createPostDto.authorId,
      },
    });
    return {
      success: true,
      message: 'Post created successfully',
      data: post,
    };
  }
}
