import { Test, TestingModule } from '@nestjs/testing';
import { RagDbController } from './rag-db.controller';

describe('RagDbController', () => {
  let controller: RagDbController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RagDbController],
    }).compile();

    controller = module.get<RagDbController>(RagDbController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
