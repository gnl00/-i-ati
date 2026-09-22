import { Container, Input, Text, type Focusable } from '@earendil-works/pi-tui'
import type { ToolUserQuestion, ToolUserQuestionAnswer } from '@shared/tools/userQuestion'
import { displayText } from './TuiState'
import type { TuiTheme } from './TuiTheme'

export function parseQuestionAnswer(
  question: ToolUserQuestion,
  value: string
): ToolUserQuestionAnswer {
  if (question.type === 'text') {
    if (question.required && !value.trim()) throw new Error('请填写此项。')
    if (value.length > (question.maxLength ?? 2000)) throw new Error('回答超过字数限制。')
    return { questionId: question.id, text: value }
  }
  const choices = value.trim() ? value.split(/[,，\s]+/).filter(Boolean) : []
  if (choices.some((v) => !/^\d+$/.test(v))) throw new Error('请输入选项编号。')
  const indexes = choices.map(Number)
  if (new Set(indexes).size !== indexes.length) throw new Error('选项编号重复。')
  const options = question.options ?? []
  if (indexes.some((i) => i < 1 || i > options.length)) throw new Error('选项编号不在范围内。')
  const min = question.minSelections ?? (question.required ? 1 : 0)
  const max = question.type === 'single_select' ? 1 : (question.maxSelections ?? options.length)
  if (indexes.length < min || indexes.length > max) throw new Error(`请选择 ${min} 至 ${max} 项。`)
  return {
    questionId: question.id,
    optionIds: indexes.map((i) => options[i - 1].id)
  }
}

/** Focus stays on the input so IME candidate windows track the hardware cursor. */
export class TuiQuestion extends Container implements Focusable {
  private input = new Input()
  private index = 0
  private answers: ToolUserQuestionAnswer[] = []
  private error = ''
  private hasFocus = false
  get focused(): boolean {
    return this.hasFocus
  }
  set focused(value: boolean) {
    this.hasFocus = value
    this.input.focused = value
  }

  constructor(
    private readonly questions: ToolUserQuestion[],
    private readonly theme: TuiTheme,
    private readonly submit: (answers: ToolUserQuestionAnswer[] | null) => void,
    private readonly refresh: () => void
  ) {
    super()
    this.input.onEscape = (): void => this.submit(null)
    this.input.onSubmit = (value): void => {
      try {
        const answer = parseQuestionAnswer(this.questions[this.index], value)
        const answers = [...this.answers, answer]
        if (this.index + 1 === this.questions.length) this.submit(answers)
        else {
          this.answers = answers
          this.index++
          this.input.setValue('')
          this.error = ''
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
      }
      this.refresh()
    }
  }

  handleInput(data: string): void {
    this.input.handleInput(data)
  }
  override render(width: number): string[] {
    this.clear()
    const question = this.questions[this.index]
    this.addChild(
      new Text(this.theme.bold(`需要你的回答 · ${this.index + 1}/${this.questions.length}`), 0, 1)
    )
    this.addChild(new Text(displayText(question.prompt), 0, 0))
    for (const [i, option] of (question.options ?? []).entries()) {
      this.addChild(
        new Text(
          displayText(
            `${i + 1}. ${option.label}${option.recommended ? '（推荐）' : ''}${option.description ? ` · ${option.description}` : ''}`
          ),
          0,
          0
        )
      )
    }
    this.addChild(
      new Text(
        this.theme.muted(
          question.type === 'text'
            ? '输入回答，Enter 确认，Esc 取消'
            : '输入编号，多选用逗号分隔，Enter 确认，Esc 取消'
        ),
        0,
        1
      )
    )
    this.addChild(this.input)
    if (this.error) this.addChild(new Text(this.theme.error(this.error), 0, 0))
    return super.render(width)
  }
}
