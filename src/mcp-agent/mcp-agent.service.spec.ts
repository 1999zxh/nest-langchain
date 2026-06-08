import { Test, TestingModule } from '@nestjs/testing';
import { McpAgentService } from './mcp-agent.service';

describe('McpAgentService', () => {
  let service: McpAgentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [McpAgentService],
    }).compile();

    service = module.get<McpAgentService>(McpAgentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
