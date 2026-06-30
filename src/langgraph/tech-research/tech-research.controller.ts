import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TechResearchService } from './tech-research.service'

@Controller('tech-research')
export class TechResearchController {
  constructor(private readonly techResearchService: TechResearchService) { }
  // 启动调研（启动后在 humanReview 处暂停）
  @Post('start')
  start(@Body() body: { question: string; threadId: string }) {
    return this.techResearchService.startResearch(body.question, body.threadId)
  }

  // 批准报告发布
  @Post(':threadId/approve')
  approve(@Param('threadId') threadId: string) {
    return this.techResearchService.approve(threadId)
  }

  // 要求修改（图重新执行 generateReport）
  @Post(':threadId/revise')
  revise(@Param('threadId') threadId: string, @Body() body: { feedback: string }) {
    return this.techResearchService.revise(threadId, body.feedback)
  }

  // 拒绝
  @Post(':threadId/reject')
  reject(@Param('threadId') threadId: string) {
    return this.techResearchService.reject(threadId)
  }

  // 查看执行状态和日志
  @Get(':threadId/state')
  getState(@Param('threadId') threadId: string) {
    return this.techResearchService.getState(threadId)
  }
}
