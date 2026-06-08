import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

@Injectable()
export class McpClientService implements OnModuleInit, OnModuleDestroy {
  private client: Client; // 这里可以替换为具体的 MCP 客户端类型
  private transport: StdioClientTransport;

  async onModuleInit() {
    this.client = new Client(
      {
        name: 'nestjs-mcp-client', version: '1.0.0'
      },
      { capabilities: {} }
    );
    // stdio 模式：NestJS 以子进程方式启动 MCP Server
    this.transport = new StdioClientTransport({
      command: 'ts-node',
      args: ['src/mcp-server/server.ts'],
      // 把当前环境变量传给子进程（包含 DATABASE_URL 等）
      env: { ...process.env },
    })
    await this.client.connect(this.transport)
    console.log('✅ MCP Client 已连接到 MCP Server')
  }

  async listTools() {
    const response = await this.client.listTools()
    return response.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }))
  }

  // ── 调用指定工具 ──────────────────────────────────
  async callTool(toolName: string, args: Record<string, any>) {
    const response = await this.client.callTool({
      name: toolName,
      arguments: args,
    }) as any

    // MCP 响应里 content 是数组，取第一个 text 内容
    const textContent = response.content.find(c => c.type === 'text')
    return {
      tool: toolName,
      result: textContent?.text ?? '工具无返回内容',
      isError: response.isError ?? false,
    }
  }

  async onModuleDestroy() {
    await this.client.close()
    console.log('MCP Client 已断开连接')
  }
}
