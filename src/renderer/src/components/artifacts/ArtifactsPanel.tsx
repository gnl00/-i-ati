import { Button } from '@renderer/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { toast } from '@renderer/components/ui/use-toast'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import {
  Copy,
  Download,
  ExternalLink,
  FileCode,
  Globe,
  Monitor,
  RotateCw,
  X
} from 'lucide-react'
import React, { useMemo, useState } from 'react'
import SyntaxHighlighter from 'react-syntax-highlighter'
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/hljs'

export const ArtifactsPanel: React.FC = () => {
  const { setArtifactsPanel, messages, artifactsActiveTab, setArtifactsActiveTab } = useChatStore()
  const [selectedFileIndex, setSelectedFileIndex] = useState(0)

  // Find the latest message that contains artifacts content
  const lastArtifactMessage = useMemo(() => {
    return [...messages].reverse().find(m => m.body.artifacts && m.body.content)
  }, [messages])

  // Parse multi-file artifact structure
  const { files, artifactTitle } = useMemo(() => {
    const rawContent = (lastArtifactMessage?.body.content as string) || ''

    // Look for <antArtifact> tag
    const tagMatch = rawContent.match(/<antArtifact[\s\S]*?>([\s\S]*?)<\/antArtifact>/i)
    const innerContent = tagMatch ? tagMatch[1].trim() : rawContent.trim()

    // Extract title from attributes
    const titleMatch = rawContent.match(/title="([^"]*)"/i)
    const title = titleMatch ? titleMatch[1] : 'Artifact Project'

    // Parse files: looking for <file path="...">...</file> pattern or code blocks with filenames
    const fileRegex = /<file\s+path="([^"]+)"[\s\S]*?>([\s\S]*?)<\/file>/gi
    const parsedFiles: { path: string, content: string, language: string }[] = []
    let match: RegExpExecArray | null

    while ((match = fileRegex.exec(innerContent)) !== null) {
      const path = match[1]
      const content = match[2].trim()
      const ext = path.split('.').pop()?.toLowerCase() || ''

      let language = 'text'
      if (['html', 'htm'].includes(ext)) language = 'html'
      else if (['js', 'jsx', 'mjs'].includes(ext)) language = 'javascript'
      else if (['ts', 'tsx'].includes(ext)) language = 'typescript'
      else if (['css', 'scss', 'less'].includes(ext)) language = 'css'
      else if (['json'].includes(ext)) language = 'json'
      else if (['svg'].includes(ext)) language = 'svg'

      parsedFiles.push({ path, content, language })
    }

    // If no <file> tags found, check for markdown code blocks (fallback)
    if (parsedFiles.length === 0) {
      const codeBlockRegex = /```(\w+)?(?:\s+filename="([^"]+)")?\n([\s\S]*?)```/gi
      while ((match = codeBlockRegex.exec(innerContent)) !== null) {
        const language = match[1] || 'text'
        const path = match[2] || `file-${parsedFiles.length + 1}.${language === 'javascript' ? 'js' : language}`
        const content = match[3].trim()
        parsedFiles.push({ path, content, language })
      }
    }

    // Still empty? Treat whole content as one HTML file
    if (parsedFiles.length === 0 && innerContent) {
      parsedFiles.push({
        path: 'index.html',
        content: innerContent,
        language: 'html'
      })
    }

    return {
      files: parsedFiles,
      artifactTitle: title
    }
  }, [lastArtifactMessage])

  const selectedFile = files[selectedFileIndex] || null

  const handleClose = () => {
    setArtifactsPanel(false)
  }

  const handleCopy = async () => {
    if (!selectedFile) return
    try {
      await navigator.clipboard.writeText(selectedFile.content)
      toast({
        description: `✅ ${selectedFile.path} 已复制`,
        duration: 1500,
      })
    } catch (err) {
      toast({
        variant: 'destructive',
        description: '❌ 复制失败',
        duration: 1500,
      })
    }
  }

  const handleDownload = () => {
    if (!selectedFile) return
    const blob = new Blob([selectedFile.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = selectedFile.path
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast({
      description: `✅ ${selectedFile.path} 已下载`,
      duration: 1500,
    })
  }

  // Find previewable content (prefers index.html or first html/svg file)
  const previewContent = useMemo(() => {
    if (files.length === 0) return null

    // Priority 1: index.html
    let htmlFile = files.find(f => f.path.toLowerCase() === 'index.html')

    // Priority 2: first HTML file
    if (!htmlFile) htmlFile = files.find(f => f.language === 'html')

    // Priority 3: first SVG file
    if (!htmlFile) htmlFile = files.find(f => f.language === 'svg')

    if (!htmlFile) return null

    if (htmlFile.language === 'svg') {
      return `<!DOCTYPE html><html><body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#fafafa">${htmlFile.content}</body></html>`
    }

    let processedContent = htmlFile.content
    files.forEach(f => {
      if (f.path !== htmlFile?.path) {
        // Inline CSS
        if (f.language === 'css') {
          processedContent = processedContent.replace(
            new RegExp(`<link[^>]*href=["']${f.path}["'][^>]*>`, 'gi'),
            `<style>${f.content}</style>`
          )
        }
        // Inline JS
        if (f.language === 'javascript') {
          processedContent = processedContent.replace(
            new RegExp(`<script[^>]*src=["']${f.path}["'][^>]*><\/script>`, 'gi'),
            `<script>${f.content}</script>`
          )
        }
      }
    })

    return processedContent
  }, [files])

  return (
    <div className="h-full flex flex-col bg-background/95 backdrop-blur-xl border-l border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">
      <Tabs
        value={artifactsActiveTab}
        className="flex-1 flex flex-col min-h-0"
        onValueChange={setArtifactsActiveTab}
      >
        {/* Header with Tabs */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
          <TabsList className="bg-gray-100/80 dark:bg-gray-900/80 h-8 p-0.5 rounded-lg border border-black/5 dark:border-white/5">
            <TabsTrigger
              value="preview"
              className="px-3 h-7 text-[11px] font-semibold rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all"
            >
              <Monitor className="w-3 h-3 mr-1.5" />
              Preview
            </TabsTrigger>
            <TabsTrigger
              value="files"
              className="px-3 h-7 text-[11px] font-semibold rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all"
            >
              <FileCode className="w-3 h-3 mr-1.5" />
              Files
            </TabsTrigger>
          </TabsList>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
            onClick={handleClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Preview Tab Content */}
        <TabsContent
          value="preview"
          className="flex-1 min-h-0 m-0 flex flex-col overflow-hidden data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300"
        >
          {previewContent ? (
            <div className="flex-1 flex flex-col p-3 overflow-hidden">
              <div className="flex-1 flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
                {/* Minimal Browser Bar */}
                <div className="h-9 flex items-center gap-3 px-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 shrink-0">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-700" />
                    <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-700" />
                    <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-700" />
                  </div>
                  <div className="flex-1 h-5.5 flex items-center px-2 gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded text-gray-400">
                    <Globe className="w-2.5 h-2.5" />
                    <span className="text-[9px] font-mono truncate select-all">{artifactTitle.toLowerCase().replace(/\s+/g, '-')}.local</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-blue-500">
                      <RotateCw className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-gray-400 hover:text-blue-500"
                      onClick={() => {
                        const blob = new Blob([previewContent], { type: 'text/html' })
                        const url = URL.createObjectURL(blob)
                        window.open(url, '_blank')
                      }}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <iframe
                  srcDoc={previewContent}
                  title="artifact-preview"
                  className="w-full flex-1 bg-white"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          ) : (
            <EmptyState icon={<Monitor className="w-10 h-10" />} title="Unable to Preview" description="This artifact doesn't seem to contain any previewable HTML or SVG content." />
          )}
        </TabsContent>

        {/* Files Tab Content */}
        <TabsContent
          value="files"
          className="flex-1 min-h-0 m-0 flex flex-col overflow-hidden data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300"
        >
          {files.length > 0 ? (
            <div className="flex-1 flex w-full overflow-hidden">
              {/* Slim File Sidebar */}
              <div className="w-40 border-r border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 overflow-y-auto shrink-0 p-1.5 space-y-0.5">
                <div className="px-2 py-1.5 mb-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Project Files</span>
                </div>
                {files.map((file, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedFileIndex(idx)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[11px] transition-all group",
                      selectedFileIndex === idx
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
                        : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                    )}
                  >
                    <FileCode className={cn("w-3 h-3 shrink-0", selectedFileIndex === idx ? "text-blue-500" : "text-gray-400 group-hover:text-gray-600")} />
                    <span className="truncate">{file.path}</span>
                  </button>
                ))}
              </div>
              {/* Enhanced Code Viewer */}
              <div className="flex-1 flex flex-col overflow-hidden bg-[#282a36]">
                <div className="h-8 flex items-center justify-between px-3 bg-black/20 border-b border-white/5 shrink-0">
                  <span className="text-[10px] font-mono text-gray-400">{selectedFile?.path}</span>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-500 hover:text-white" onClick={handleCopy}>
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-500 hover:text-white" onClick={handleDownload}>
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto selection:bg-blue-500/30">
                  <SyntaxHighlighter
                    language={selectedFile?.language || 'text'}
                    style={dracula}
                    customStyle={{
                      margin: 0,
                      padding: '1.25rem',
                      fontSize: '12px',
                      lineHeight: '1.6',
                      backgroundColor: 'transparent'
                    }}
                    showLineNumbers={true}
                    lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1em', color: '#6272a4', opacity: 0.5 }}
                  >
                    {selectedFile?.content || ''}
                  </SyntaxHighlighter>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState icon={<FileCode className="w-10 h-10" />} title="No Files Found" description="The AI has not generated any specific project files yet." />
          )}
        </TabsContent>

        {/* Action Footer */}
        <div className="h-12 flex items-center justify-between px-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[9px] font-bold uppercase tracking-wider">
              {files.length} {files.length === 1 ? 'File' : 'Files'}
            </div>
            <span className="text-[10px] text-gray-400 font-medium truncate max-w-[120px]">{artifactTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-[10px] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:bg-gray-50" disabled={files.length === 0} onClick={handleDownload}>
              <Download className="w-3 h-3 mr-1.5" />
              ZIP Project
            </Button>
            <Button size="sm" variant="default" className="h-7 text-[10px] bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-semibold" disabled={files.length === 0} onClick={handleCopy}>
              <Copy className="w-3 h-3 mr-1.5" />
              Copy File
            </Button>
          </div>
        </div>
      </Tabs>
    </div>
  )
}

const EmptyState = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <div className="flex-1 w-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="w-20 h-20 rounded-3xl bg-gray-50/50 dark:bg-gray-900/50 border border-black/5 dark:border-white/5 flex items-center justify-center text-gray-300 dark:text-gray-700 mb-6 shadow-sm">
      {icon}
    </div>
    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[240px] leading-relaxed">
      {description}
    </p>
  </div>
)
