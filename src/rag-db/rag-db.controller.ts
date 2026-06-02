import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { RagDbService } from './rag-db.service'

@Controller('rag-db')
export class RagDbController {
  constructor(private readonly ragDbService: RagDbService) { }

  @Post('load')
  loadDocuments(
    @Body() body: { documents: { id: string; content: string; source?: string }[] },
  ) {
    return this.ragDbService.loadDocuments(body.documents)
  }
  @Post('search')
  search(@Body() body: { query: string; topK?: number }) {
    return this.ragDbService.search(body.query, body.topK)
  }

  @Post('query')
  query(@Body() body: { question: string; topK?: number }) {
    return this.ragDbService.query(body.question, body.topK)
  }

  @Get('status')
  getStatus() {
    return this.ragDbService.getStatus()
  }

  // @Delete('clear')
  // clearKnowledge() {
  //   return this.ragDbService.clearKnowledge()
  // }
}
