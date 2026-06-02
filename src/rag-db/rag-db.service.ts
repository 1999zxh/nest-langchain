import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory'
import { config } from 'src/config';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents'
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { PGVectorStore, DistanceStrategy } from '@langchain/community/vectorstores/pgvector'
import { Pool } from 'pg';

@Injectable()
export class RagDbService implements OnModuleInit {
  // 对话模型：RAG 场景用低温度，让回答更严格
  private llm = new ChatOllama({
    model: config.ollama.chatModel,
    baseUrl: config.ollama.baseUrl,
    temperature: 0.1, // 低温度，让工具调用决策更稳定
    think: false, // 关闭 Ollama 内置思考提示，直接返回模型输出
    numPredict: 1024,
  })

  // 向量化模型：把文本转成数字向量（用于相似度比较）
  private embeddings = new OllamaEmbeddings({
    model: config.ollama.embedModel,   // 'mxbai-embed-large'
    baseUrl: config.ollama.baseUrl,
  })

  // ✅ 关键：Pool 在 Service 层创建，整个 Service 生命周期内共用一个
  // 不要在每个方法里创建 Pool，更不要在方法里 end() 它
  private pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // 连接池配置（可选，生产环境建议显式配置）
    max: 10,              // 最大连接数，根据并发量调整
    idleTimeoutMillis: 30000,  // 空闲连接 30 秒后释放
    connectionTimeoutMillis: 5000, // 获取连接超时 5 秒
  })

  //链接池
  // ✅ 关键：pgVectorConfig 里传 pool 而不是 postgresConnectionOptions
  // 传 pool → PGVectorStore 直接用这个池，不会自己创建新池，end() 就无效了
  // 传 postgresConnectionOptions → PGVectorStore 自己创建新池，end() 会销毁它
  private pgVectorConfig = {
    pool: this.pool,                          // ← 传已有 pool，不是连接字符串
    collectionName: 'rag-knowledge-base', // 逻辑上的集合名，实际表名会加前缀
    collectionTableName: 'langchain_pg_collection',// 存 collection info 的表
    tableName: 'langchain_pg_embedding',// 存向量和文本的表
    columns: {
      idColumnName: 'id',// 存文档 ID 的列
      vectorColumnName: 'embedding',//  存向量的列
      contentColumnName: 'document',// 存文本内容的列
      metadataColumnName: 'cmetadata',// 存元信息的列（JSON 格式）
    },
    distanceStrategy: 'cosine' as DistanceStrategy,// 计算相似度用余弦距离（cosine）比欧氏距离（euclidean）更常见，效果更好
  }

  // ✅ 核心修复：缓存 VectorStore 实例，整个 Service 生命周期内共用
  private vectorStore: PGVectorStore | null = null;
  private docCount = 0;

  // ✅ NestJS 模块初始化时，只执行一次数据库表结构检查和实例化
  async onModuleInit() {
    // 首次初始化，创建表
    await this.safeInitializeVectorStore();
  }

  /**
  * ✅ 核心修复：安全初始化方法，完美兼容热更新
  */
  private async safeInitializeVectorStore() {
    const client = await this.pool.connect();
    try {
      // 1. 确保 pgvector 扩展存在
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');

      // 2. 检查目标表是否已经存在
      const res = await client.query(
        `SELECT EXISTS (
           SELECT FROM information_schema.tables 
           WHERE table_name = $1
         )`,
        [this.pgVectorConfig.tableName]
      );
      const tableExists = res.rows[0].exists;

      if (!tableExists) {
        console.log(`[RagDbService] 表 ${this.pgVectorConfig.tableName} 不存在，正在创建...`);
        // 表不存在时，才让 LangChain 去自动建表
        this.vectorStore = await PGVectorStore.initialize(this.embeddings, this.pgVectorConfig);
      } else {
        console.log(`[RagDbService] 表 ${this.pgVectorConfig.tableName} 已存在，直接复用连接。`);
        // 表已存在时，跳过 LangChain 的内部建表检查，直接实例化
        // 这样既避免了 42701 报错，又大幅提升了热更新的启动速度！
        this.vectorStore = new PGVectorStore(this.embeddings, this.pgVectorConfig);
      }
    } catch (error) {
      console.error('[RagDbService] 初始化向量库失败:', error);
      throw error;
    } finally {
      client.release(); // 务必归还连接
    }
  }
  // ── 加载文档 ───────────────────────────────────
  async loadDocuments(documents: { id: string; content: string; source?: string }[]) {
    // 文本分块器
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
      separators: ['\n\n', '\n', '。', '！', '？', ' ', ''],
    });

    const allDocs: Document[] = [];

    for (const doc of documents) {
      const chunks = await splitter.createDocuments(
        [doc.content],
        [{ id: doc.id, source: doc.source || doc.id }]
      );
      allDocs.push(...chunks);
    }

    // // fromDocuments 内部会从 this.pool 取连接，用完自动归还
    // // 不需要手动 end()
    // await PGVectorStore.fromDocuments(
    //   allDocs,
    //   this.embeddings,
    //   this.pgVectorConfig,
    // )
    // ✅ 直接使用缓存的 vectorStore 添加文档，不再使用静态方法 fromDocuments
    await this.vectorStore.addDocuments(allDocs);
    this.docCount += documents.length;
    return {
      success: true,
      originalDocs: documents.length,
      totalChunks: allDocs.length,
      message: `已存入 ${documents.length} 篇文档（${allDocs.length} 个块）到 PostgreSQL`,
    }
  }
  // ── 纯向量检索 ────────────────────────────────────
  async search(query: string, topK = 3) {
    // ✅ 直接使用缓存的 vectorStore 进行检索，彻底告别重复 initialize
    const results = await this.vectorStore.similaritySearchWithScore(query, topK);
    return {
      query,
      results: results.map(([doc, score]) => ({
        content: doc.pageContent,
        source: doc.metadata.source,
        // score 是余弦距离（越小越相关），转成相似度更直观
        similarity: parseFloat((1 - score).toFixed(4)),
        rawDistance: parseFloat(score.toFixed(4)),
      })),
    }
  }

  // ── 纯向量检索（不过大模型，直接看检索结果）──────────
  async query(question: string, topK = 3) {
    if (!this.vectorStore) {
      return { success: false, message: '请先加载文档' }
    }
    // Step 1：检索相关文档块
    const retrieved = await this.vectorStore.similaritySearchWithScore(question, topK);
    if (!retrieved.length) {
      return { question, answer: '知识库中没有找到相关内容', sources: [] }
    }

    // score 是距离，越小越相关
    // 过滤掉距离 > 0.5 的结果（相似度 < 0.5，基本不相关）
    const filtered = retrieved.filter(([, score]) => score <= 0.5)

    if (!filtered.length) {
      return { question, answer: '知识库中没有找到相关内容', sources: [] }
    }

    const context = filtered
      .map(([doc], i) => `[${i + 1}] ${doc.pageContent}`)
      .join('\n\n')

    // Step 3：RAG Prompt，严格限制模型只能用参考资料回答
    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system', `你是知识库问答助手，严格基于参考资料回答。
        规则：
        1. 只根据参考资料内容回答，不能使用资料外的知识
        2. 资料中没有相关信息，回答"知识库中暂无相关内容"
        3. 回答简洁准确，使用中文

        参考资料：
        {context}`
      ],
      [
        'human', `{question}`
      ]
    ])
    // Step 4：调用模型生成回答
    const chain = prompt.pipe(this.llm).pipe(new StringOutputParser())
    const answer = await chain.invoke({ context, question })
    return {
      question,
      answer,
      sources: retrieved.map(([doc, score]) => ({
        content: doc.pageContent,
        source: doc.metadata.source,
        score: parseFloat(score.toFixed(4)),
      })),
    }
  }

  async getStatus() {
    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) FROM langchain_pg_embedding
         WHERE collection_id = (
           SELECT uuid FROM langchain_pg_collection WHERE name = $1
         )`,
        [this.pgVectorConfig.collectionName],
      )
      const chunkCount = parseInt(result.rows[0].count)
      return {
        mode: 'PGVectorStore',
        loaded: chunkCount > 0,
        chunkCount,
        collection: this.pgVectorConfig.collectionName,
        message: chunkCount > 0
          ? `PostgreSQL 向量库中有 ${chunkCount} 个文档块`
          : '向量库为空，请先加载文档',
      }
    } catch {
      return { mode: 'PGVectorStore', loaded: false, message: '向量表未初始化' }
    }
  }

  async clearKnowledge() {
    await this.pool.query(
      `DELETE FROM langchain_pg_embedding
       WHERE collection_id = (
         SELECT uuid FROM langchain_pg_collection WHERE name = $1
       )`,
      [this.pgVectorConfig.collectionName],
    )
    await this.pool.query(
      `DELETE FROM langchain_pg_collection WHERE name = $1`,
      [this.pgVectorConfig.collectionName],
    )
    this.docCount = 0
    return { success: true, message: `已清空 collection：${this.pgVectorConfig.collectionName}` }
  }

  // ✅ NestJS 应用退出时才真正关闭连接池
  async onModuleDestroy() {
    await this.pool.end()
    console.log('RagService：PostgreSQL 连接池已关闭')
  }
}
