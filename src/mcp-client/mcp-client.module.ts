import { Module } from '@nestjs/common';
import { McpClientController } from './mcp-client.controller';
import { McpClientService } from './mcp-client.service';

@Module({
  controllers: [McpClientController],
  providers: [McpClientService],
  exports: [McpClientService],  // 导出供其他模块使用
})
export class McpClientModule { }
