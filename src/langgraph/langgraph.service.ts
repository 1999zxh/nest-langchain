import { ChatOllama } from '@langchain/ollama';
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  StateGraph,
  START,
  END,
  MessagesAnnotation,
  MemorySaver,
} from '@langchain/langgraph'
import { config } from 'src/config';
import { HumanMessage, SystemMessage } from 'langchain';

@Injectable()
export class LanggraphService implements OnModuleInit {

  private simpleGraph: any
  private memoryGraph: any

  onModuleInit() {
    const llm = new ChatOllama({
      model: config.ollama.chatModel,
      baseUrl: config.ollama.baseUrl,
      temperature: 0.1, // 低温度，让工具调用决策更稳定
      think: false, // 关闭 Ollama 内置思考提示，直接返回模型输出
      numPredict: 1024,
    })

    // ── 工作流一：无记忆，每次 invoke 独立 ─────────────
    const callModel = async (state: typeof MessagesAnnotation.State) => {
      // state.messages 包含本次传入的所有消息
      const response = await llm.invoke(state.messages)
      // 只返回新增消息，LangGraph 自动追加（不覆盖历史）
      return { messages: [response] }
    }

    this.simpleGraph = new StateGraph(MessagesAnnotation)
      .addNode('callModel', callModel)
      .addEdge(START, 'callModel')
      .addEdge('callModel', END)
      .compile()

    // ── 工作流二：有记忆，同 threadId 共享历史 ──────────
    const callModelWithMemory = async (state: typeof MessagesAnnotation.State) => {
      const messages = [
        new SystemMessage('你是专业的 AI 助手，请记住对话上下文。'),
        ...state.messages
      ]

      const response = await llm.invoke(messages)
      return { messages: [response] }
    }

    this.memoryGraph = new StateGraph(MessagesAnnotation)
      .addNode('callModel', callModelWithMemory)
      .addEdge(START, 'callModel')
      .addEdge('callModel', END)
      .compile({ checkpointer: new MemorySaver() }) // 传入 checkpointer 开启记忆 自动保存每次对话历史到内存 

  }

  async simpleChat(message: string): Promise<any> {
    const result = await this.simpleGraph.invoke({
      messages: [
        new SystemMessage('你是专业的 AI 助手，回答简洁清晰。'),
        new HumanMessage(message)
      ]
    })
    console.log('result', result);
    return result.messages[result.messages.length - 1].content as string
  }


  async memoryChat(threadId: string, message: string): Promise<string> {
    const result = await this.memoryGraph.invoke(
      { messages: [new HumanMessage(message)] },
      { configurable: { thread_id: threadId } } // 传入 threadId，开启同线程记忆共享
    )
    console.log('result', result);
    return result.messages[result.messages.length - 1].content as string
  }

  async getHistory(threadId: string): Promise<string[]> {
    const state = await this.memoryGraph.getState({ configurable: { thread_id: threadId } })
    return (state.values.messages ?? []).map((m: any, i: number) => ({
      index: i,
      role: m._getType?.() === 'human' ? 'user' : 'assistant',
      content: m.content,
    }))
  }
}
