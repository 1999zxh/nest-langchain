import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { config } from 'src/config';

// Supervisor 监督模式

// START → supervisor ──researcher──→ researcher ─┐
//                    ──analyst────→ analyst    ─┤→（回到 supervisor）
//                    ──writer─────→ writer     ─┘
//                    ──FINISH─────→ END

// 执行说明：
//   supervisor：LLM 读取任务和已完成列表，决定下一步调哪个 Agent
//   Worker 节点：各自有专业 System Prompt，执行后把结果写回 messages
//   循环：Worker 完成后回到 supervisor，supervisor 再判断
//   退出：supervisor 输出 FINISH，路由函数走向 END

const SupervisorState = Annotation.Root({
  messages: MessagesAnnotation.spec.messages,
  nextAgent: Annotation<string>(),
  completedAgents: Annotation<string[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
})


@Injectable()
export class SupervisorService implements OnModuleInit {
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

    // Supervisor 节点：LLM 决定下一步调哪个 Agent
    const supervisor = async (state: typeof SupervisorState.State) => {
      const done = state.completedAgents.length
        ? `已完成：${state.completedAgents.join('、')}`
        : '尚未调用任何 Agent'

      const res = await llm.invoke([
        new SystemMessage(`你是任务协调者，管理以下专业 Agent：
    - researcher：收集信息、搜索资料
    - analyst：数据分析、逻辑推理
    - writer：撰写报告、优化表达
    
    规则：
    1. 根据任务需求按需选择 Agent
    2. ${done}
    3. 所有必要工作完成后输出 FINISH
    4. 只输出下一个 Agent 名称或 FINISH，不要其他内容
    
    可选值：researcher | analyst | writer | FINISH`),
        ...state.messages,
      ])

      const next = (res.content as string).trim()
      const valid = ['researcher', 'analyst', 'writer', 'FINISH']
      const safeNext = valid.includes(next) ? next : 'FINISH'

      return {
        nextAgent: safeNext,
        // 把调度决定记录到消息历史，让 Worker 有上下文
        messages: [new AIMessage(`[Supervisor] 下一步 → ${safeNext}`)],
      }
    }

    // 路由函数：FINISH → END，其他 → 对应 Worker 节点
    const routeToAgent = (state: typeof SupervisorState.State) =>
      state.nextAgent === 'FINISH' ? END : state.nextAgent

    // Worker 工厂函数：避免三个 Worker 节点重复代码
    const createWorker = (name: string, systemPrompt: string) =>
      async (state: typeof SupervisorState.State) => {
        // 取第一条用户消息作为任务描述
        const userMsg = state.messages.find(m => m._getType?.() === 'human')
        // 取最近 4 条消息作为上下文（包含其他 Agent 的输出）
        const context = state.messages.slice(-4).map(m => m.content).join('\n')

        const res = await llm.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(
            `原始任务：${userMsg?.content ?? ''}\n\n当前上下文：\n${context}`
          ),
        ])

        return {
          messages: [new AIMessage(`[${name}] ${res.content}`)],
          completedAgents: [name],
        }
      }

    this.graph = new StateGraph(SupervisorState)
      .addNode('supervisor', supervisor)
      .addNode('researcher', createWorker('researcher', '你是研究员，擅长收集整理信息，提供详细调研结果。'))
      .addNode('analyst', createWorker('analyst', '你是分析师，擅长数据分析，提供洞察和建议。'))
      .addNode('writer', createWorker('writer', '你是写作专家，把信息整理成清晰专业的报告。'))
      .addEdge(START, 'supervisor')
      .addConditionalEdges('supervisor', routeToAgent, {
        researcher: 'researcher',
        analyst: 'analyst',
        writer: 'writer',
        [END]: END,
      })
      // 所有 Worker 完成后都回到 supervisor，让它决定下一步
      .addEdge('researcher', 'supervisor')
      .addEdge('analyst', 'supervisor')
      .addEdge('writer', 'supervisor')
      .compile()
  }

  async run(userInput: string) {
    const result = await this.graph.invoke(
      { messages: [new HumanMessage(userInput)] },
      { recursionLimit: 30 }
    )

    const messages = result.messages as AIMessage[]
    const agentLog = messages
      .filter(m => typeof m.content === 'string' && (m.content as string).startsWith('['))
      .map(m => m.content as string)

    const writerOutputs = agentLog.filter(l => l.startsWith('[writer]'))
    const finalReport = writerOutputs.length
      ? writerOutputs.at(-1)!.replace('[writer] ', '')
      : agentLog.at(-1) ?? '无输出'

    return {
      agentLog,
      completedAgents: result.completedAgents,
      finalReport,
    }
  }
}
