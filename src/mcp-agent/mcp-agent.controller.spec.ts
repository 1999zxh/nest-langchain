import { Test, TestingModule } from '@nestjs/testing';
import { McpAgentController } from './mcp-agent.controller';

describe('McpAgentController', () => {
  let controller: McpAgentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [McpAgentController],
    }).compile();

    controller = module.get<McpAgentController>(McpAgentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
