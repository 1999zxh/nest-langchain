import { Test, TestingModule } from '@nestjs/testing';
import { TechResearchController } from './tech-research.controller';

describe('TechResearchController', () => {
  let controller: TechResearchController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TechResearchController],
    }).compile();

    controller = module.get<TechResearchController>(TechResearchController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
