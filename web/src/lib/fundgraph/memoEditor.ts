function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function inlineMarkdownToHtml(value: string): string {
  const escaped = escapeHtml(value);
  const withImages = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, src: string) => {
    return `<img src="${src}" alt="${alt}" loading="lazy" />`;
  });
  const withLinks = withImages.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, href: string) => {
    return `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`;
  });
  const withInlineCode = withLinks.replace(/`([^`]+)`/g, "<code>$1</code>");
  const withBold = withInlineCode.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return withBold.replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function markdownToEditorHtml(markdown: string): string {
  const source = (markdown ?? "").replace(/\r\n/g, "\n").trim();
  if (!source) return "<p></p>";

  const lines = source.split("\n");
  const chunks: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      chunks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const h3 = trimmed.match(/^###\s+(.+)$/);
    if (h3) {
      chunks.push(`<h3>${inlineMarkdownToHtml(h3[1] ?? "")}</h3>`);
      continue;
    }

    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h2) {
      chunks.push(`<h2>${inlineMarkdownToHtml(h2[1] ?? "")}</h2>`);
      continue;
    }

    const h1 = trimmed.match(/^#\s+(.+)$/);
    if (h1) {
      chunks.push(`<h1>${inlineMarkdownToHtml(h1[1] ?? "")}</h1>`);
      continue;
    }

    if (/^-\s+/.test(trimmed)) {
      const items: string[] = [trimmed.replace(/^-\s+/, "")];
      while (index + 1 < lines.length && /^-\s+/.test((lines[index + 1] ?? "").trim())) {
        index += 1;
        items.push((lines[index] ?? "").trim().replace(/^-\s+/, ""));
      }
      chunks.push(`<ul>${items.map((item) => `<li>${inlineMarkdownToHtml(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [trimmed.replace(/^\d+\.\s+/, "")];
      while (index + 1 < lines.length && /^\d+\.\s+/.test((lines[index + 1] ?? "").trim())) {
        index += 1;
        items.push((lines[index] ?? "").trim().replace(/^\d+\.\s+/, ""));
      }
      chunks.push(`<ol>${items.map((item) => `<li>${inlineMarkdownToHtml(item)}</li>`).join("")}</ol>`);
      continue;
    }

    if (/^>\s*/.test(trimmed)) {
      const quoteLines: string[] = [trimmed.replace(/^>\s*/, "")];
      while (index + 1 < lines.length && /^>\s*/.test((lines[index + 1] ?? "").trim())) {
        index += 1;
        quoteLines.push((lines[index] ?? "").trim().replace(/^>\s*/, ""));
      }
      chunks.push(`<blockquote>${quoteLines.map((item) => inlineMarkdownToHtml(item)).join("<br/>")}</blockquote>`);
      continue;
    }

    const paragraphLines: string[] = [trimmed];
    while (index + 1 < lines.length) {
      const peek = (lines[index + 1] ?? "").trim();
      if (!peek) break;
      if (/^#{1,3}\s+/.test(peek) || /^-\s+/.test(peek) || /^\d+\.\s+/.test(peek) || /^>\s*/.test(peek) || /^```/.test(peek)) {
        break;
      }
      index += 1;
      paragraphLines.push(peek);
    }
    chunks.push(`<p>${paragraphLines.map((item) => inlineMarkdownToHtml(item)).join("<br/>")}</p>`);
  }

  return chunks.join("");
}

function inlineHtmlToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (!(node instanceof HTMLElement)) {
    return "";
  }

  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";

  const childText = Array.from(node.childNodes).map((child) => inlineHtmlToMarkdown(child)).join("");
  if (tag === "strong" || tag === "b") return `**${childText}**`;
  if (tag === "em" || tag === "i") return `*${childText}*`;
  if (tag === "code" && node.parentElement?.tagName.toLowerCase() !== "pre") return `\`${childText}\``;
  if (tag === "a") {
    const href = node.getAttribute("href");
    return href ? `[${childText}](${href})` : childText;
  }
  if (tag === "img") {
    const src = node.getAttribute("src") ?? "";
    const alt = node.getAttribute("alt") ?? "";
    return src ? `![${alt}](${src})` : "";
  }
  return childText;
}

function listItemToMarkdown(node: Element): string {
  return Array.from(node.childNodes)
    .map((child) => inlineHtmlToMarkdown(child))
    .join("")
    .trim();
}

function blockNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").trim();
  }
  if (!(node instanceof HTMLElement)) return "";

  const tag = node.tagName.toLowerCase();
  if (tag === "h1") return `# ${inlineHtmlToMarkdown(node).trim()}`;
  if (tag === "h2") return `## ${inlineHtmlToMarkdown(node).trim()}`;
  if (tag === "h3") return `### ${inlineHtmlToMarkdown(node).trim()}`;
  if (tag === "p") return inlineHtmlToMarkdown(node).trim();
  if (tag === "blockquote") {
    const content = inlineHtmlToMarkdown(node).split("\n").map((line) => `> ${line}`.trim()).join("\n");
    return content.trim();
  }
  if (tag === "pre") {
    const code = node.textContent ?? "";
    return `\`\`\`\n${code.trimEnd()}\n\`\`\``;
  }
  if (tag === "ul") {
    return Array.from(node.querySelectorAll(":scope > li"))
      .map((item) => `- ${listItemToMarkdown(item)}`)
      .join("\n")
      .trim();
  }
  if (tag === "ol") {
    return Array.from(node.querySelectorAll(":scope > li"))
      .map((item, idx) => `${idx + 1}. ${listItemToMarkdown(item)}`)
      .join("\n")
      .trim();
  }
  if (tag === "img") {
    const src = node.getAttribute("src") ?? "";
    const alt = node.getAttribute("alt") ?? "";
    return src ? `![${alt}](${src})` : "";
  }
  if (tag === "div") {
    const blocks = Array.from(node.childNodes)
      .map((child) => blockNodeToMarkdown(child))
      .filter(Boolean);
    if (blocks.length) return blocks.join("\n\n");
    return inlineHtmlToMarkdown(node).trim();
  }

  return inlineHtmlToMarkdown(node).trim();
}

export function editorHtmlToMarkdown(editorHtml: string): string {
  const source = (editorHtml ?? "").trim();
  if (!source) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return source.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${source}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  const blocks = Array.from(root.childNodes)
    .map((child) => blockNodeToMarkdown(child))
    .map((line) => line.trim())
    .filter(Boolean);
  return blocks.join("\n\n").trim();
}

export function normalizeEditorHtml(editorHtml: string): string {
  return (editorHtml ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
