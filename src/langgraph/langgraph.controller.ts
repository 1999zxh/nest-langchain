import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { LanggraphService } from './langgraph.service';
import { ArticleService } from './article.service'
import { ReactAgentService } from './react-agent.service';
import { RoutingService } from './routing.service';
import { ParallelService } from './parallel.service';
import { SupervisorService } from './supervisor.service';
import { PipelineService } from './pipeline.service';
import { CodeReviewService } from './code-review.service';
import { EmailApprovalService } from './email-approval.service';

@Controller('langgraph')
export class LanggraphController {
  constructor(
    private readonly langgraphService: LanggraphService,
    private readonly articleService: ArticleService,
    private readonly reactAgentService: ReactAgentService,
    private readonly routingService: RoutingService,
    private readonly parallelService: ParallelService,
    private readonly supervisorService: SupervisorService,
    private readonly pipelineService: PipelineService,
    private readonly codeReviewService: CodeReviewService,
    private readonly emailApprovalService: EmailApprovalService,
  ) { }

  @Post('simple-chat')
  simpleChat(@Body() body: { message: string }) {
    return this.langgraphService.simpleChat(body.message)
  }

  @Post('memory-chat')
  memoryChat(@Body() body: { threadId: string, message: string }) {
    return this.langgraphService.memoryChat(body.threadId, body.message)
  }

  // 工作流二：查看对话历史
  @Get('history/:threadId')
  getHistory(@Param('threadId') threadId: string) {
    return this.langgraphService.getHistory(threadId)
  }

  // 工作流三：文章摘要流水线
  @Post('article')
  processArticle(@Body() body: { article: string }) {
    return this.articleService.process(body.article)
  }

  @Post('react-chat')
  reactChat(@Body() body: { threadId: string, message: string }) {
    return this.reactAgentService.chat(body.threadId, body.message)
  }

  @Post('route')
  route(@Body() body: { input: string }) {
    return this.routingService.handle(body.input)
  }

  @Post('parallel')
  parallel(@Body() body: { task: string }) {
    return this.parallelService.parallelChat(body.task)
  }

  @Post('supervisor')
  supervisor(@Body() body: { input: string }) {
    return this.supervisorService.run(body.input)
  }

  @Post('pipeline')
  pipeline(@Body() body: { topic: string }) {
    return this.pipelineService.createContent(body.topic)
  }
  @Post('code-review')
  codeReview(@Body() body: { code: string, language: string }) {
    return this.codeReviewService.review(body.code, body.language)
  }

  @Post('email/start')
  emailStart(@Body() body: { request: string; threadId: string }) {
    return this.emailApprovalService.start(body.request, body.threadId)
  }

  @Post('email/:threadId/approve')
  emailApprove(@Param('threadId') threadId: string) {
    return this.emailApprovalService.approve(threadId)
  }

  @Post('email/:threadId/reject')
  emailReject(@Param('threadId') threadId: string) {
    return this.emailApprovalService.reject(threadId)
  }

  @Post('email/:threadId/modify')
  emailModify(
    @Param('threadId') threadId: string,
    @Body() body: { feedback: string },
  ) {
    return this.emailApprovalService.requestModify(threadId, body.feedback)
  }

  @Get('email/:threadId/state')
  emailState(@Param('threadId') threadId: string) {
    return this.emailApprovalService.getState(threadId)
  }
}
