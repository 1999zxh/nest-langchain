import { Module } from '@nestjs/common';
import { McpAgentController } from './mcp-agent.controller';
import { McpAgentService } from './mcp-agent.service';

@Module({
  controllers: [McpAgentController],
  providers: [McpAgentService]
})
export class McpAgentModule {}
