import { Body, Controller, Get, Post } from '@nestjs/common';
import { McpClientService } from './mcp-client.service';

@Controller('mcp-client')
export class McpClientController {
  constructor(private readonly mcpClientService: McpClientService) { }

  // GET /mcp/tools → 获取所有可用工具
  @Get('tools')
  listTools() {
    return this.mcpClientService.listTools()
  }

  // POST /mcp/call → 直接调用指定工具
  @Post('call')
  callTool(@Body() body: { tool: string; args: Record<string, any> }) {
    return this.mcpClientService.callTool(body.tool, body.args)
  }
}
