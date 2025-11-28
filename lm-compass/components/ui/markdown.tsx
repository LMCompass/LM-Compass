import { cn } from "@/lib/utils"
import { marked } from "marked"
import { memo, useId, useMemo } from "react"
import ReactMarkdown, { Components } from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"
import { CodeBlock, CodeBlockCode } from "./code-block"

export type MarkdownProps = {
  children: string
  id?: string
  className?: string
  components?: Partial<Components>
}


 // Normalizes LaTeX delimiters to be compatible with remark-math
// Helper to split markdown into code/non-code segments
function splitMarkdownByCode(text: string): { segments: string[], isCode: boolean[] } {
  const segments: string[] = [];
  const isCode: boolean[] = [];
  let lastIndex = 0;
  // Regex to match code blocks (```...```) and inline code (`...`)
  const codeRegex = /(```[\s\S]*?```|`[^`\n]+`)/g;
  let match: RegExpExecArray | null;
  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(text.slice(lastIndex, match.index));
      isCode.push(false);
    }
    segments.push(match[0]);
    isCode.push(true);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex));
    isCode.push(false);
  }
  return { segments, isCode };
}

// Normalizes LaTeX delimiters to be compatible with remark-math, skipping code segments
function normalizeLatexDelimiters(text: string): string {
  const { segments, isCode } = splitMarkdownByCode(text);
  // Only normalize non-code segments
  const normalizedSegments = segments.map((segment, idx) => {
    if (isCode[idx]) return segment;
    // Convert \[...\] to $$...$$, but not if preceded by extra backslash
    segment = segment.replace(/(?<!\\)\\\[([\s\S]*?)\\\]/g, (match, content) => {
      return `$$${content}$$`;
    });
    // Convert \(...\) to $...$, but not if preceded by extra backslash
    segment = segment.replace(/(?<!\\)\\\(([\s\S]*?)\\\)/g, (match, content) => {
      return `$${content}$`;
    });
    return segment;
  });
  return normalizedSegments.join('');
}

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown)
  return tokens.map((token) => token.raw)
}

function extractLanguage(className?: string): string {
  if (!className) return "plaintext"
  const match = className.match(/language-(\w+)/)
  return match ? match[1] : "plaintext"
}

const INITIAL_COMPONENTS: Partial<Components> = {
  code: function CodeComponent({ className, children, ...props }) {
    const isInline =
      !props.node?.position?.start.line ||
      props.node?.position?.start.line === props.node?.position?.end.line

    if (isInline) {
      return (
        <span
          className={cn(
            "bg-primary-foreground rounded-sm px-1 font-mono text-sm",
            className
          )}
          {...props}
        >
          {children}
        </span>
      )
    }

    const language = extractLanguage(className)

    return (
      <CodeBlock className={className}>
        <CodeBlockCode code={children as string} language={language} />
      </CodeBlock>
    )
  },
  pre: function PreComponent({ children }) {
    return <>{children}</>
  },
}

const MemoizedMarkdownBlock = memo(
  function MarkdownBlock({
    content,
    components = INITIAL_COMPONENTS,
  }: {
    content: string
    components?: Partial<Components>
  }) {
    // Normalize LaTeX delimiters before rendering
    const normalizedContent = normalizeLatexDelimiters(content);
    
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
    )
  },
  function propsAreEqual(prevProps, nextProps) {
    return prevProps.content === nextProps.content
  }
)

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock"

function MarkdownComponent({
  children,
  id,
  className,
  components = INITIAL_COMPONENTS,
}: MarkdownProps) {
  const generatedId = useId()
  const blockId = id ?? generatedId
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children])

  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <MemoizedMarkdownBlock
          key={`${blockId}-block-${index}`}
          content={block}
          components={components}
        />
      ))}
    </div>
  )
}

const Markdown = memo(MarkdownComponent)
Markdown.displayName = "Markdown"

export { Markdown }
