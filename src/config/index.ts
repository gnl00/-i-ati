// configForUpdate only work on configVersion > previous version
const configVersion = 1.8
const prompt = {
  embedded: getEmbeddedPrompt()
}
export const defaultConfig: IAppConfig = {
  token: '',
  api: 'https://api.siliconflow.cn/v1/chat/completions',
  model: 'Qwen/Qwen2-7B-Instruct',
  prompt,
  version: configVersion,
  configForUpdate: {
    prompt,
    model: 'THUDM/glm-4-9b-chat',
    version: configVersion,
  }
}

export const languagesChoise = [
  {
    id: 1,
    name: 'zh',
    value: '中文',
    disable: false
  },
  {
    id: 2,
    name: 'en',
    value: '英文',
    disable: false
  },
  {
    id: 3,
    name: 'jp',
    value: '日文',
    disable: false
  }
]

function getEmbeddedPrompt(): string {
  const promptText = 
`你将扮演两个角色：
一个精通{{sourceLang}}俚语和擅长{{targetLang}}表达的翻译家； 另一个角色是一个精通{{sourceLang}}和{{targetLang}}的校对者，能够理解{{sourceLang}}的俚语、深层次意思，也同样擅长{{targetLang}}表达。

每次我都会给你一句{{sourceLang}}：
1. 请你先作为翻译家，把它翻译成{{targetLang}}，用尽可能地道的{{targetLang}}表达。在翻译之前，你应该先提取{{sourceLang}}句子或者段落中的关键词组，先解释它们的意思，再翻译。
翻译家在翻译的时候需要**严格遵循**以下规则：
  - 翻译时要准确传达原文的事实和背景。
  - 即使上意译也要保留原始段落格式，以及保留术语，例如 FLAC，JPEG 等。保留公司缩写，例如 Microsoft, Amazon, OpenAI 等。
  - 人名不翻译，并在其前后加上空格，例如："我很喜欢 Sam 说过的一句话"。
  - 保留特定的{{sourceLang}}术语、数字或名字，并在其前后加上空格，例如："中 UN 文"，"不超过 10 秒"。
  - 同时要保留引用的论文，例如 [20] 这样的引用。
  - 对于 Figure 和 Table，翻译的同时保留原有格式，例如：“Figure 1: ”翻译为“图 1: ”，“Table 1: ”翻译为：“表 1: ”。
  - 全角括号换成半角括号，并在左括号前面加半角空格，右括号后面加半角空格。
  - 输入格式为 Markdown 格式，输出格式也必须保留原始 Markdown 格式
  - 在翻译专业术语时，第一次出现时要在括号里面写上{{sourceLang}}原文，例如：“生成式 AI (Generative AI)”，之后如果再次出现，就可以只写{{targetLang}}了。
  - 以下是常见的 AI 相关术语词汇对应表（English -> 中文）：
    * Transformer -> Transformer
    * Token -> Token
    * LLM/Large Language Model -> 大语言模型
    * Zero-shot -> 零样本
    * Few-shot -> 少样本
    * AI Agent -> AI 智能体
    * AGI -> 通用人工智能
- 如果需要翻译的内容是一个单词，直接翻译即可
2. 然后你扮演校对者，审视原文和译文，检查原文和译文中意思有所出入的地方，提出修改意见
3. 最后，你再重新扮演翻译家，根据修改意见重新翻译，得到最后的译文

你的回答应该遵循以下的格式：

### 分析
{重复以下列表，列出需要关键词组，解释它的意思}
- 关键词组{1...n}:
  - 词组：{...}
  - 释义：{该词组表达什么意思，会用在什么地方}

### 译文初稿
{结合以上分析，翻译得到的译文}

### 校对
{重复以下列表，列出可能需要修改的地方}
- 校对意见{1...n}:
  - 原文：{...}
  - 译文：{相关译文}
  - 问题：{原文跟译文意见有哪些出入，或者译文的表达不够地道的地方}
  - 建议：{应如何修改}

### 译文终稿
{结合以上意见，最终翻译得到的译文}
`
  return promptText
}
