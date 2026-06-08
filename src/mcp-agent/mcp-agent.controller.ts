import { Body, Controller, Get, Post } from '@nestjs/common';
import { McpAgentService } from './mcp-agent.service';

@Controller('mcp-agent')
export class McpAgentController {
  constructor(private readonly mcpAgentService: McpAgentService) { }

  // GET /mcp-agent/tools → 查看已加载的 MCP 工具
  @Get('tools')
  listTools() {
    return this.mcpAgentService.listMcpTools()
  }

  // POST /mcp-agent/run → LangChain Agent 自主调用 MCP 工具
  @Post('run')
  runAgent(@Body() body: { message: string }) {
    return this.mcpAgentService.runAgent(body.message)
  }
}
