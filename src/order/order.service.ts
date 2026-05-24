import { Injectable } from '@nestjs/common';

@Injectable()
export class OrderService {
  getOrder(): string {
    return '这是 orders';
  }
}
