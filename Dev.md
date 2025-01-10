# @i-app

> dev logs for @i-app

- 使用 Electron frame: false，当 shadcnui 的 ScrollArea 元素进入到 header dom 的下方，会导致 window 变得不可拖动，查了一下发现是 ResizableGroup 和 SrollArea 层级之间 zindex 的问题。
  解决办法：放弃使用 ScrollArea
- 以前使用 WebRTC 搭聊天界面时，想到可以让列表部分渲染优化性能，但一直懒于实现。这次使用虚拟列表来优化聊天界面。

  - 使用 `rc-virtual-list` 库实现虚拟列表。会存在和 ScrollArea 一样的层级问题
- addEventListener 异步设置 electron 标题：https://medium.com/@devblog_/electron-window-settitle-how-to-1a2e268d3430
- 仿照写了一个 resizable 组件，https://stackademic.com/blog/building-a-resizable-sidebar-component-with-persisting-width-using-react-tailwindcss 性能贼拉
- 使用 react-window 替换 rc-virtual-list，无层级遮挡问题。一开始发现存在闪烁现象，原来是 react-window 需要通过 style 参数来设置 fixedSize 列表的尺寸，否则会有尺寸计算错误导致的闪烁。style 参数必须。
  闪烁解决，但是虚拟 dom 渲染相对于 react-window 虚拟列表要慢，高度计算出来 virHeights 列表前几次总是 0，高度不好计算。
- HomeV2RcVirList 中使用 rc-virtual-list 可使用 '100%' 实现自适应高度，不再需要手动从虚拟 dom 获取。经过测试 virtua 虚拟列表也可以实现自适应高度。
- 在使用了代码高亮之后

  [任何的输入，会导 `<pre></pre>`内元素的全量渲染，在大段代码进行更新的时候，会有](https://github.com/react-simple-code-editor/react-simple-code-editor/issues/66)比较明显的卡顿

  刚开始还以为是没有使用虚拟列表来优化聊天界面导致的，但是使用虚拟列表之后改问题依然存在。排查发现原来是**代码高亮的锅**。
- 再后来发现。。。原来是组件未拆分的锅。。。SyntaxHighlighter 对不起，是我太菜 😭 组件太大未拆分，导致[每次输入的时候都会全局渲染](https://developer.aliyun.com/article/1048728)
- ...
