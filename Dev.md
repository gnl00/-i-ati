# @i-app

> dev logs for @i-app

- 使用 Electron frame: false，当 shadcnui 的 ScrollArea 元素进入到 header dom 的下方，会导致 window 变得不可拖动，查了一下发现是 ResizableGroup 和 SrollArea 层级之间 zindex 的问题。
  解决办法：放弃使用 ScrollArea
- 以前使用 WebRTC 搭聊天界面时，想到可以让列表部分渲染优化性能，但一直懒于实现。这次使用虚拟列表来优化聊天界面。
  - 使用 `rc-virtual-list` 库实现虚拟列表。会存在和 ScrollArea 一样的层级问题
- addEventListener 异步设置 electron 标题：https://medium.com/@devblog_/electron-window-settitle-how-to-1a2e268d3430
- 仿照写了一个 resizable 组件，https://stackademic.com/blog/building-a-resizable-sidebar-component-with-persisting-width-using-react-tailwindcss 性能贼拉