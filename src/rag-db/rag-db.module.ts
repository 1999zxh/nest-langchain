import { Module } from '@nestjs/common';
import { RagDbController } from './rag-db.controller';
import { RagDbService } from './rag-db.service';

@Module({
  controllers: [RagDbController],
  providers: [RagDbService]
})
export class RagDbModule {}
