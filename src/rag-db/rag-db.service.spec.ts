import { Test, TestingModule } from '@nestjs/testing';
import { RagDbService } from './rag-db.service';

describe('RagDbService', () => {
  let service: RagDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RagDbService],
    }).compile();

    service = module.get<RagDbService>(RagDbService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
