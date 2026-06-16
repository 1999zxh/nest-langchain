import { HumanMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ChatOllama } from '@langchain/ollama';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { config } from 'src/config';

//流水线
// START → research → outline → writing → review → END

// State 传递：
//   research  写入 state.research（素材）
//   outline   读 state.research  → 写入 state.outline（大纲）
//   writing   读 state.outline   → 写入 state.draft（初稿）
//   review    读 state.draft     → 写入 state.finalArticle（终稿）

const PipelineState = Annotation.Root({
  topic: Annotation<string>(),
  research: Annotation<string>(),
  outline: Annotation<string>(),
  draft: Annotation<string>(),
  finalArticle: Annotation<string>(),
  progress: Annotation<string[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
})

@Injectable()
export class PipelineService implements OnModuleInit {
  private graph: any

  onModuleInit() {
    // const llm = new ChatOpenAI({
    //   model: config.langGraph.model,
    //   apiKey: config.langGraph.apiKey,
    //   configuration: { baseURL: config.langGraph.baseURL },
    //   temperature: 0.5,
    // })

    const llm = new ChatOllama({
      model: config.ollama.chatModel,
      baseUrl: config.ollama.baseUrl,
      temperature: config.ollama.temperature,
      think: false, // 关闭 Ollama 内置思考提示，直接返回模型输出
      numPredict: 512,
    });

    const researchAgent = async (state: typeof PipelineState.State) => {
      const res = await llm.invoke([
        new HumanMessage(`你是研究员，为主题"${state.topic}"收集素材：
        1. 背景介绍（2-3 句）
        2. 核心要点（3-5 个）
        3. 典型案例（1-2 个）
        每条不超过 50 字。`)
      ]);
      return { research: res.content as string, progress: ['✅ 素材收集完成'] }
    }

    const outlineAgent = async (state: typeof PipelineState.State) => {
      const res = await llm.invoke([
        new HumanMessage(`你是内容策划，根据素材为"${state.topic}"生成大纲：
        素材：${state.research}
        格式：# 章节 / - 子项，共 3-5 章`)
      ])
      return { outline: res.content as string, progress: ['✅ 大纲生成完成'] }
    }

    const writingAgent = async (state: typeof PipelineState.State) => {
      const res = await llm.invoke([
        new HumanMessage(`你是撰稿人，根据大纲写文章（400-600 字）：
          主题：${state.topic}
          大纲：${state.outline}
          参考素材：${state.research}`),
      ])
      return { draft: res.content as string, progress: ['✅ 初稿写作完成'] }
    }

    const reviewAgent = async (state: typeof PipelineState.State) => {
      const res = await llm.invoke([
        new HumanMessage(`你是编辑，优化以下文章，直接输出优化后全文：\n${state.draft}`),
      ])
      return { finalArticle: res.content as string, progress: ['✅ 审校优化完成'] }
    }


    this.graph = new StateGraph(PipelineState)
      .addNode('researchAgent', researchAgent)
      .addNode('outlineAgent', outlineAgent)
      .addNode('writingAgent', writingAgent)
      .addNode('reviewAgent', reviewAgent)
      .addEdge(START, 'researchAgent')
      .addEdge('researchAgent', 'outlineAgent')
      .addEdge('outlineAgent', 'writingAgent')
      .addEdge('writingAgent', 'reviewAgent')
      .addEdge('reviewAgent', END)
      .compile()

  }

  async createContent(topic: string) {
    const t0 = Date.now()
    const result = await this.graph.invoke({ topic })
    return {
      topic,
      progress: result.progress,
      finalArticle: result.finalArticle,
      totalTime: `${Date.now() - t0}ms`,
    }
  }
}
