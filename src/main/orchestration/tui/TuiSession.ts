import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { chatDb } from '@main/db/chat'
import { configDb } from '@main/db/config'
import { RunService } from '@main/orchestration/chat/run'
import { TuiState, type TuiQueueItem, type TuiInteraction } from '@main/hosts/tui/TuiState'
import type { ToolUserQuestionAnswer } from '@shared/tools/userQuestion'
import type { PermissionApprovalMode } from '@tools/approval'

export class TuiSession {
  readonly state = new TuiState()
  private running?: Promise<void>
  private closing = false
  private cancelRequested = false

  constructor(
    readonly workspace: string,
    private readonly runs: Pick<
      RunService,
      | 'waitForPostRunJobs'
      | 'submit'
      | 'steer'
      | 'cancel'
      | 'submitToolConfirmation'
      | 'submitToolUserQuestion'
    > = new RunService(),
    private readonly chats: Pick<
      typeof chatDb,
      'saveChat' | 'getChatByUuid' | 'getAllChats' | 'getMessagesByChatUuid' | 'updateChat'
    > = chatDb,
    private readonly config: Pick<
      typeof configDb,
      'getConfig' | 'getConfigValue' | 'saveConfigValue'
    > = configDb
  ) {}

  models(): {
    value: string
    label: string
    description: string
    ref: ModelRef
  }[] {
    const config = this.config.getConfig()
    return (config?.accounts ?? []).flatMap((account) => {
      const provider = config?.providerDefinitions?.find(
        (p) => p.id === account.providerId && p.enabled !== false
      )
      return !provider
        ? []
        : account.models
            .filter((model) => model.enabled !== false && model.type !== 'img_gen')
            .map((model) => ({
              value: JSON.stringify({
                accountId: account.id,
                modelId: model.id
              }),
              label: model.label || model.id,
              description: account.label,
              ref: { accountId: account.id, modelId: model.id }
            }))
    })
  }

  initialize(resume?: string, modelId?: string, accountId?: string): void {
    if (resume) this.resume(resume)
    else this.newChat()
    const models = this.models()
    const preferred = this.state.chat?.modelRef ?? this.config.getConfig()?.tools?.mainModel
    const matches = modelId
      ? models.filter(
          (m) => m.ref.modelId === modelId && (!accountId || m.ref.accountId === accountId)
        )
      : []
    if (modelId && matches.length !== 1)
      throw new Error('模型未找到或存在多个同名模型，请同时指定 --account。')
    this.state.model =
      matches[0]?.ref ??
      models.find(
        (m) => m.ref.accountId === preferred?.accountId && m.ref.modelId === preferred.modelId
      )?.ref ??
      (models.length === 1 ? models[0].ref : undefined)
    if (!this.state.model) this.state.notice = '使用 /model 选择已配置的模型。'
  }

  sessions(): ChatEntity[] {
    return this.chats
      .getAllChats()
      .filter(
        (chat) => chat.workspacePath && resolve(chat.workspacePath) === resolve(this.workspace)
      )
      .sort((a, b) => b.updateTime - a.updateTime)
  }

  newChat(): void {
    this.assertIdle()
    this.saveInput()
    const now = Date.now()
    const chat: ChatEntity = {
      uuid: randomUUID(),
      title: 'TUI 会话',
      messages: [],
      workspacePath: this.workspace,
      modelRef: this.state.model,
      permissionApprovalMode: 'manual',
      createTime: now,
      updateTime: now
    }
    chat.id = this.chats.saveChat(chat)
    this.state.draft = ''
    this.state.queue = []
    this.state.load(chat, [])
    this.state.status = '就绪'
  }

  resume(uuid: string): void {
    this.assertIdle()
    const chat = this.chats.getChatByUuid(uuid)
    if (!chat) throw new Error('会话不存在。')
    if (!chat.workspacePath || resolve(chat.workspacePath) !== resolve(this.workspace))
      throw new Error('会话属于其他工作区，请使用该工作区启动 TUI。')
    this.saveInput()
    this.restoreInput(chat.uuid)
    this.state.load(chat, this.chats.getMessagesByChatUuid(chat.uuid))
    this.state.model = chat.modelRef ?? this.state.model
    this.state.status = '就绪'
  }

  setModel(ref: ModelRef): void {
    this.assertIdle()
    if (
      !this.models().some((m) => m.ref.accountId === ref.accountId && m.ref.modelId === ref.modelId)
    )
      throw new Error('模型不可用。')
    this.state.model = ref
    if (this.state.chat) {
      this.state.chat = { ...this.state.chat, modelRef: ref }
      this.chats.updateChat(this.state.chat)
    }
    this.state.notice = ''
    this.state.onChange(true)
  }

  async submit(text: string, mode: 'steer' | 'followUp' = 'steer'): Promise<void> {
    if (this.closing || !text.trim()) return
    if (text.length > 256 * 1024) throw new Error('输入超过 256 KiB，请改为引用文件。')
    if (!this.state.model) throw new Error('请先使用 /model 选择模型。')
    if (this.state.activeRun) {
      if (this.state.queue.length >= 5) throw new Error('队列已满，请等待当前输入被处理。')
      const item: TuiQueueItem = { id: randomUUID(), text, mode }
      if (mode === 'steer') {
        const result = this.runs.steer({
          submissionId: this.state.activeRun,
          chatUuid: this.state.chat!.uuid,
          queueItemId: item.id,
          text,
          images: []
        })
        if (!result.accepted) throw new Error(`无法插入当前执行：${result.reason}`)
      }
      this.state.queue.push(item)
      this.state.onChange(true)
      return
    }
    this.start(text)
  }

  private start(text: string): void {
    const chat = this.state.chat!
    const id = randomUUID()
    this.cancelRequested = false
    this.state.tools.clear()
    this.state.activeRun = id
    this.state.status = '准备'
    this.state.notice = ''
    if (chat.title === 'TUI 会话') {
      this.state.chat = {
        ...chat,
        title: text.trim().split('\n')[0].slice(0, 80)
      }
      this.chats.updateChat(this.state.chat)
    }
    this.state.onChange(true)
    this.running = this.execute(id, text)
  }

  private async execute(id: string, text: string): Promise<void> {
    let completed = false
    try {
      const result = await this.runs.submit(
        {
          submissionId: id,
          chatUuid: this.state.chat!.uuid,
          modelRef: this.state.model!,
          input: {
            textCtx: text,
            mediaCtx: [],
            stream: true,
            source: 'tui',
            permissionApprovalMode: this.state.chat?.permissionApprovalMode,
            tools: this.mcpTools
          }
        },
        {
          eventSinks: [{ handleEvent: (event): void => this.state.handleEvent(event) }]
        }
      ).completion
      completed = result.state === 'completed'
    } catch (error) {
      if (!this.cancelRequested)
        this.state.notice = error instanceof Error ? error.message : String(error)
    } finally {
      this.state.activeRun = undefined
      this.state.interactions = []
      this.state.preview = undefined
      this.state.queue = this.state.queue.map((item) =>
        item.mode === 'steer' ? { ...item, mode: 'returned' } : item
      )
      this.state.status = this.cancelRequested ? '已停止' : completed ? '完成' : '失败'
      this.state.onChange(true)
      if (
        completed &&
        !this.cancelRequested &&
        !this.closing &&
        !this.state.queue.some((i) => i.mode === 'returned')
      ) {
        const next = this.state.queue.shift()
        if (next) this.start(next.text)
      }
    }
  }

  mcpTools: { name: string }[] = []

  cancel(): void {
    if (!this.state.activeRun) return
    this.cancelRequested = true
    this.runs.cancel({
      submissionId: this.state.activeRun,
      chatUuid: this.state.chat!.uuid
    })
    this.state.status = '停止中'
    this.state.onChange(true)
  }

  recoverQueue(): string {
    if (this.state.activeRun) throw new Error('请先停止当前执行，再取回队列。')
    const text = this.state.queue.map((i) => i.text).join('\n\n')
    this.state.queue = []
    this.state.onChange(true)
    return text
  }

  answer(interaction: TuiInteraction, answer: boolean | ToolUserQuestionAnswer[] | null): void {
    if (
      interaction.submissionId !== this.state.activeRun ||
      !this.state.interactions.includes(interaction)
    )
      throw new Error('此请求已结束。')
    if (interaction.kind === 'approval') {
      const result = this.runs.submitToolConfirmation({
        confirmationId: interaction.payload.confirmationId,
        submissionId: interaction.submissionId,
        chatUuid: interaction.payload.chatUuid,
        toolCallId: interaction.payload.toolCallId,
        approved: answer === true,
        ...(answer !== true ? { reason: 'user_denied' } : {})
      }, 'tui')
      if (!result.ok && !result.confirmation) throw new Error(result.reason)
      if (result.confirmation) this.state.resolveApproval(result.confirmation)
    } else {
      const result = this.runs.submitToolUserQuestion({
        ...interaction.payload,
        ...(answer === null ? { action: 'cancel' } : { action: 'submit', answers: answer })
      })
      if (!result.ok) throw new Error(result.message ?? result.reason)
    }
    this.state.onChange(true)
  }

  setApproval(mode: PermissionApprovalMode): void {
    this.assertIdle()
    this.state.chat = { ...this.state.chat!, permissionApprovalMode: mode }
    this.chats.updateChat(this.state.chat)
    this.state.onChange(true)
  }

  async close(): Promise<void> {
    this.closing = true
    this.cancel()
    await this.running
    this.saveInput()
    await this.runs.waitForPostRunJobs()
  }

  private saveInput(): void {
    if (!this.state.chat) return
    this.config.saveConfigValue(
      `tui:input:${this.state.chat.uuid}`,
      JSON.stringify({ draft: this.state.draft, queue: this.state.queue })
    )
  }

  private restoreInput(uuid: string): void {
    const raw = this.config.getConfigValue(`tui:input:${uuid}`)
    this.state.draft = ''
    this.state.queue = []
    if (!raw) return
    try {
      const saved = JSON.parse(raw) as { draft?: unknown; queue?: unknown }
      if (typeof saved.draft === 'string') this.state.draft = saved.draft.slice(0, 256 * 1024)
      if (Array.isArray(saved.queue))
        this.state.queue = saved.queue
          .filter((item) => typeof item?.text === 'string')
          .slice(0, 5)
          .map((item) => ({
            id: randomUUID(),
            text: item.text.slice(0, 256 * 1024),
            mode: 'returned'
          }))
    } catch {
      this.state.notice = '未能恢复终端草稿。会话记录仍保存在数据库中。'
    }
  }

  private assertIdle(): void {
    if (this.state.activeRun || this.state.queue.length)
      throw new Error('请先停止执行并取回待发送队列。')
  }
}
