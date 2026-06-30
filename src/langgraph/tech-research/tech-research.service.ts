import { HumanMessage } from '@langchain/core/messages';
import { Annotation, Command, END, interrupt, MemorySaver, Send, START, StateGraph } from '@langchain/langgraph';
import { ChatOllama } from '@langchain/ollama';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { config } from 'src/config';

// START
//   ↓
// parseTask（解析问题，拆分调研维度）
//   ↓ Send API 并行分发
// researchAgent × N（各维度并行调研）
//   ↓ 汇聚（所有实例完成）
// analyzeResults（综合分析，提取技术选项）
//   ↓
// generateReport（生成 Markdown 报告）
//   ↓
// humanReview（interrupt 暂停，等待人工）
//   ├── approved（批准）   → END
//   ├── need_revision（修改）→ generateReport（重新生成）
//   └── rejected（拒绝）   → END

// TechResearchState：
//   question        string      // 用户输入的问题
//   researchResults []          // 并行调研结果（reducer 追加）
//   analysis        string      // 综合分析
//   techOptions     []          // 提取的技术选项（含评分）
//   report          string      // 生成的 Markdown 报告
//   humanFeedback   string      // 人工修改意见
//   reviewStatus    string      // 审核状态
//   revisionCount   number      // 修改次数（累加）
//   executionLog    string[]    // 执行日志（追加）

const TechResearchState = Annotation.Root({
  question: Annotation<string>(),
  researchResults: Annotation<{
    dimension: string
    findings: string
    pros: string[]
    cons: string[]
  }[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
  analysis: Annotation<string>(),
  techOptions: Annotation<{ name: string; score: number; bestFor: string }[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
  report: Annotation<string>(),
  humanFeedback: Annotation<string>(),
  reviewStatus: Annotation<'pending' | 'approved' | 'rejected' | 'need_revision'>(),
  revisionCount: Annotation<number>({
    reducer: (prev, curr) => prev + curr,
    default: () => 0,
  }),
  executionLog: Annotation<string[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
})

// ── 子任务 State（Send 传给 researchAgent 实例）──────────
const SingleResearchState = Annotation.Root({
  question: Annotation<string>(),
  dimension: Annotation<string>(),
  focusPoints: Annotation<string[]>(),
})

@Injectable()
export class TechResearchService implements OnModuleInit {
  private graph: any;
  private llm!: ChatOllama
  onModuleInit() {
    this.llm = new ChatOllama({
      model: config.ollama.chatModel,
      baseUrl: config.ollama.baseUrl,
      temperature: config.ollama.temperature,
      think: false, // 关闭 Ollama 内置思考提示，直接返回模型输出
      numPredict: 512,
    });
    this.graph = this.buildGraph()
  }

  private buildGraph() {

    // ── 节点一：解析问题，拆分调研维度 ──────────────────
    const parseTask = async (state: typeof TechResearchState.State) => {
      const res = await this.llm.invoke([
        new HumanMessage(
          `把以下技术选型问题拆成 3-4 个独立调研维度（性能、生态、开发体验、运维成本等）。
                问题：${state.question}
                输出 JSON（不要其他内容）：
                [{"dimension":"维度名","focusPoints":["关注点1","关注点2"]}]`
        ),
      ])

      let dimensions: { dimension: string; focusPoints: string[] }[]
      try {
        const json = (res.content as string).replace(/```json\n?|\n?```/g, '').trim()
        dimensions = JSON.parse(json)
      } catch {
        dimensions = [
          { dimension: '技术能力', focusPoints: ['功能完整性', '性能'] },
          { dimension: '社区生态', focusPoints: ['活跃度', '文档'] },
          { dimension: '适用场景', focusPoints: ['最佳场景', '限制'] },
        ]
      }

      const list = dimensions.slice(0, 4)
      console.log(`\n📋 [parseTask] 拆分为 ${list.length} 个调研维度:`)
      list.forEach(d => console.log(`   → ${d.dimension}`))

      // ✅ LangGraph 1.2.x：Send 数组必须包在 Command({ goto }) 里
      return new Command({
        goto: list.map(d =>
          new Send('researchAgent', {
            question: state.question,
            dimension: d.dimension,
            focusPoints: d.focusPoints,
          })
        ),
      })
    }

    // ── 节点二：单维度调研（多实例并行执行）──────────────
    const researchAgent = async (state: typeof SingleResearchState.State) => {
      console.log(`\n⚡ [researchAgent] 调研维度: ${state.dimension}`)
      const res = await this.llm.invoke([
        new HumanMessage(
          `针对以下技术选型维度提供分析：
            问题：${state.question}
            维度：${state.dimension}
            关注点：${state.focusPoints.join('、')}
            输出 JSON（不要其他内容）：
            {"findings":"主要发现（2-3句）","pros":["优势1","优势2"],"cons":["劣势1"]}`
        ),
      ])

      let result: { findings: string; pros: string[]; cons: string[] }
      try {
        const json = (res.content as string).replace(/```json\n?|\n?```/g, '').trim()
        result = JSON.parse(json)
      } catch {
        result = { findings: '分析完成', pros: ['待补充'], cons: ['待补充'] }
      }

      console.log(`   完成: ${state.dimension}`)
      return {
        researchResults: [{ dimension: state.dimension, ...result }],
        executionLog: [`✅ 完成调研：${state.dimension}`],
      }
    }

    // ── 节点三：综合分析 ──────────────────────────────
    const analyzeResults = async (state: typeof TechResearchState.State) => {
      console.log(`\n🔍 [analyzeResults] 综合分析 ${state.researchResults.length} 个维度`)
      const text = state.researchResults
        .map(r => `【${r.dimension}】\n发现：${r.findings}\n优势：${r.pros.join('、')}\n劣势：${r.cons.join('、')}`)
        .join('\n\n')

      const res = await this.llm.invoke([
        new HumanMessage(
          `根据各维度调研结果综合分析，提取主要技术选项：
                问题：${state.question}
                各维度调研：\n${text}
                输出 JSON（不要其他内容）：
                {"analysis":"综合结论（2-3句）","techOptions":[{"name":"技术名","score":8,"bestFor":"适用场景"}]}`
        ),
      ])

      let result: { analysis: string; techOptions: any[] }
      try {
        const json = (res.content as string).replace(/```json\n?|\n?```/g, '').trim()
        result = JSON.parse(json)
      } catch {
        result = { analysis: '综合分析完成', techOptions: [] }
      }

      return {
        analysis: result.analysis,
        techOptions: result.techOptions,
        executionLog: ['✅ 综合分析完成'],
      }
    }

    // ── 节点四：生成报告 ──────────────────────────────
    const generateReport = async (state: typeof TechResearchState.State) => {
      const versionTip = state.humanFeedback
        ? `\n\n⚠️ 请根据以下修改意见重新生成：${state.humanFeedback}`
        : ''

      const optionsText = state.techOptions
        .map(t => `- **${t.name}**（评分：${t.score}/10）：${t.bestFor}`)
        .join('\n')

      console.log(`\n📝 [generateReport] 生成第 ${state.revisionCount + 1} 版报告`)

      const res = await this.llm.invoke([
        new HumanMessage(
          `生成技术选型报告（Markdown 格式，400-600 字）。${versionTip}
                问题：${state.question}
                综合分析：${state.analysis}
                技术选项：\n${optionsText}
                要求：包含背景说明、各维度分析摘要、技术对比表格、最终推荐及理由`
        ),
      ])

      return {
        report: res.content as string,
        revisionCount: state.humanFeedback ? 1 : 0,
        executionLog: [`✅ 报告生成（第 ${state.revisionCount + 1} 版）`],
      }
    }

    // ── 节点五：人工审核（interrupt 暂停）─────────────
    const humanReview = async (state: typeof TechResearchState.State) => {
      console.log(`\n⏸️  [humanReview] 等待人工审核（第 ${state.revisionCount + 1} 版）`)

      const decision = interrupt({
        type: 'report_review',
        message: `请审核技术选型报告（第 ${state.revisionCount + 1} 版）`,
        report: state.report,
        meta: {
          question: state.question,
          dimensionsCount: state.researchResults.length,
          optionsCount: state.techOptions.length,
        },
        actions: {
          approve: '批准发布',
          revision: '需要修改（请附修改意见）',
          reject: '拒绝',
        },
      })

      if (typeof decision === 'string') {
        console.log(`   人工决定: ${decision}`)
        return { reviewStatus: decision as any }
      }
      if ((decision as any)?.action === 'revision') {
        console.log(`   人工决定: 需要修改，意见: ${(decision as any).feedback}`)
        return {
          reviewStatus: 'need_revision' as const,
          humanFeedback: (decision as any).feedback as string,
        }
      }
      console.log(`   人工决定: rejected`)
      return { reviewStatus: 'rejected' as const }
    }

    // ── 路由函数 ──────────────────────────────────────
    const routeAfterReview = (state: typeof TechResearchState.State) => {
      if (state.reviewStatus === 'approved') return END
      if (state.reviewStatus === 'need_revision') return 'generateReport'
      return END
    }

    return new StateGraph(TechResearchState)
      .addNode('parseTask', parseTask, { ends: ['researchAgent'] })
      .addNode('researchAgent', researchAgent, { ends: ['analyzeResults'] })
      .addNode('analyzeResults', analyzeResults)
      .addNode('generateReport', generateReport)
      .addNode('humanReview', humanReview)
      .addEdge(START, 'parseTask')
      .addEdge('researchAgent', 'analyzeResults')
      .addEdge('analyzeResults', 'generateReport')
      .addEdge('generateReport', 'humanReview')
      .addConditionalEdges('humanReview', routeAfterReview, {
        generateReport: 'generateReport',
        [END]: END,
      })
      .compile({ checkpointer: new MemorySaver() })
  }

  // ── 对外方法 ──────────────────────────────────────
  // 启动调研（启动后在 humanReview 处暂停）
  async startResearch(question: string, threadId: string) {
    const t0 = Date.now()
    console.log(`\n${'═'.repeat(50)}`)
    console.log(`📨 [research/start] "${question}"`)

    const result = await this.graph.invoke(
      { question },
      { configurable: { thread_id: threadId }, recursionLimit: 50 }
    )

    if (result.__interrupt__) {
      return {
        status: 'waiting_for_review',
        threadId,
        reviewData: result.__interrupt__[0].value,
        executionTime: `${Date.now() - t0}ms`,
      }
    }
    return { status: 'completed', threadId }
  }

  // 批准报告发布
  async approve(threadId: string) {
    console.log(`\n✅ [research/approve] threadId: ${threadId}`)
    await this.graph.invoke(
      new Command({ resume: 'approved' }),
      { configurable: { thread_id: threadId } }
    )
    const state = await this.graph.getState({ configurable: { thread_id: threadId } })

    return {
      status: 'published',
      report: state.values.report,
      executionLog: state.values.executionLog,
    }
  }

  // 要求修改（图重新执行 generateReport）
  async revise(threadId: string, feedback: string) {
    console.log(`\n✏️  [research/revise] threadId: ${threadId}`)
    const result = await this.graph.invoke(
      new Command({ resume: { action: 'revision', feedback } }),
      { configurable: { thread_id: threadId } }
    )

    if (result.__interrupt__) {
      return {
        status: 'waiting_for_review',
        message: '报告已修改，请重新审核',
        reviewData: result.__interrupt__[0].value,
      }
    }
    return { status: 'completed' }
  }

  // 拒绝
  async reject(threadId: string) {
    console.log(`\n❌ [research/reject] threadId: ${threadId}`)
    await this.graph.invoke(
      new Command({ resume: 'rejected' }),
      { configurable: { thread_id: threadId } }
    )

    return { status: 'rejected', message: '调研报告已拒绝' }
  }

  // 查看执行状态和日志
  async getState(threadId: string) {
    const state = await this.graph.getState({ configurable: { thread_id: threadId } })
    return {
      executionLog: state.values.executionLog,
      reviewStatus: state.values.reviewStatus,
      revisionCount: state.values.revisionCount,
      nextNodes: state.next,
    }
  }
}
