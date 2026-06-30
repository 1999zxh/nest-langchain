import { Module } from '@nestjs/common';
import { TechResearchService } from './tech-research.service';
import { TechResearchController } from './tech-research.controller';

@Module({
  providers: [TechResearchService],
  controllers: [TechResearchController]
})
export class TechResearchModule { }
