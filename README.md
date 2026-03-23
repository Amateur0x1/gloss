# Parallel Text Finder

一个纯本地运行的 macOS 桌面应用，面向中英 PDF 对读。

当前版本支持：

- 导入中文译本 PDF
- 导入英文原文 PDF
- 本地抽取文本并切成句段
- 使用多语言 embedding 模型在本机生成向量
- 点击中文句段时，在英文侧定位最可能对应的原文片段

## 技术栈

- Electron
- React
- TypeScript
- `pdfjs-dist`
- `@huggingface/transformers`

## 运行

```bash
cd /Users/zhourongchang/self/pdf-bilingual-desktop
pnpm install
pnpm dev
```

首次导入文档时，应用会下载多语言向量模型到本地缓存。

## 打包前预览

```bash
cd /Users/zhourongchang/self/pdf-bilingual-desktop
pnpm desktop:preview
```

## 当前边界

第一版是“基于 PDF 提取文本的对读器”，不是逐字级 PDF 坐标映射器。

也就是说：

- 现在是对“提取后的句段”做匹配
- 适合平行文本、译文对应关系较稳定的书
- 如果译文存在大量意译、删改、拆句合句，命中会下降

## 下一步适合继续做的增强

- 支持双向检索：点英文反查中文
- 增加上下文窗口重排
- 记住上次导入的书籍和向量索引
- 接入 PDF 可视化高亮，而不只是文本列表
- 支持更多语言组合
