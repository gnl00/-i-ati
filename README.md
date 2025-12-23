# @i-app

> An AI API client

## Usages

### macOS

macOS can not open after installed, execute the command below then run again

```shell
sudo xattr -r -d com.apple.quarantine /Applications/te-app.app
```

### Linux

Update ubuntu desktop icon manually

```shell
# sudo update-desktop-database
sudo gtk-update-icon-cache /usr/share/icons/hicolor
sudo update-icon-caches /usr/share/icons/hicolor
sudo update-desktop-database /usr/share/applications
```

## Build

Linux install required dependencies

```shell
sudo apt update && sudo apt install -y libx11-dev libxtst-dev libc6 libstdc++6 build-essential libpng-dev
```

Install dependencies

```shell
pnpm install
```

Do build

```shell
pnpm build:linux
pnpm build:win
pnpm build:mac
```

> No icon show in Linux?
> Add more resolution icon under `build` folder, 256x256/512x512/1024x1024... then build again

## ScreenShot

![chat-windows](./screenshot/20251223224340.png)

![chat-sheet](./screenshot/20251223224240.png)

## TODO

- [X] api quetsion tooltip
- [X] use StreamEvent
- [X] custom prompt support
- [X] add shortcut key: `CmdOrCtrl+G` show window, `CmdOrCtrl+Esc` hide window
- [X] smooth scrool
- [X] use virtual list for chat list
- [X] [markdown code highlight](https://stackoverflow.com/questions/71907116/react-markdown-and-react-syntax-highlighter)
- [X] input area toolbar
- [X] Copy and Edit tooltips
- [X] ~~fetch models from api(if API provider supports)~~ maybe no need
- [X] save chat list
- [ ] chat list ~~title~~ and hisoty summary
- [X] dark/light mode
- [X] artifacts supports(~~THANKS CLAUDECODE :P~~)
- [X] default model for chat
- [X] add provider
- [ ] chat config topK/topP/maxToken(very soon~)
- [X] web search
- [ ] web search items setting
- [X] mcp(yes it is here~)
- [ ] re-design provider card
- [X] math(LaTex) render(only `$` and `$$` supports,[ref](https://github.com/remarkjs/remark-math?tab=readme-ov-file#example-katex)))

## Reference

- https://github.com/openai/openai-node
- https://www.builder.io/blog/stream-ai-javascript
- https://stackoverflow.com/questions/73547502/how-do-i-stream-openais-completion-api
- https://stackademic.com/blog/building-a-resizable-sidebar-component-with-persisting-width-using-react-tailwindcss
- https://medium.com/@devblog_/electron-window-settitle-how-to-1a2e268d3430
- https://reniki.com/blog/gradient-border
