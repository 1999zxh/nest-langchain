import { Test, TestingModule } from '@nestjs/testing';
import { TechResearchService } from './tech-research.service';

describe('TechResearchService', () => {
  let service: TechResearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TechResearchService],
    }).compile();

    service = module.get<TechResearchService>(TechResearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
