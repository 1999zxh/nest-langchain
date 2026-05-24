import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getSpy(): string {
    return 'spy';
  }
  getHello(): string {
    return 'Hello World!';
  }
}
