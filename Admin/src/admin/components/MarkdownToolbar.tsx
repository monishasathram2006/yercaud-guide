import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Video,
  Table as TableIcon,
  Code,
  Minus,
  Undo2,
  Redo2,
} from "lucide-react";

/**
 * A Markdown-syntax toolbar over a plain <textarea> — not a WYSIWYG editor.
 * `body` is stored and rendered as Markdown end-to-end (admin preview and the
 * public site both use ReactMarkdown), so this inserts/wraps Markdown syntax
 * around the current selection rather than adopting a rich-text library that
 * would output HTML and require rewriting both render paths. Underline and
 * Video have no Markdown syntax, so they insert raw <u>/<video> tags — that's
 * why both ReactMarkdown usages load rehypeRaw (see blog.$slug.tsx and this
 * page's own preview tab).
 */

type Update = { value: string; selectionStart: number; selectionEnd: number };

function wrapSelection(text: string, start: number, end: number, before: string, after: string, placeholder: string): Update {
  const selected = text.slice(start, end) || placeholder;
  const value = text.slice(0, start) + before + selected + after + text.slice(end);
  return { value, selectionStart: start + before.length, selectionEnd: start + before.length + selected.length };
}

/** Prefixes every line touched by the selection — e.g. "- " for a bullet list, "1. " for an ordered one (CommonMark renumbers ordered lists on render, so a literal "1." on every line is valid, not a bug). */
function prefixLines(text: string, start: number, end: number, prefix: string): Update {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = text.length;
  const block = text.slice(lineStart, lineEnd);
  const prefixed = block
    .split("\n")
    .map((line) => (line.startsWith(prefix) ? line : prefix + line))
    .join("\n");
  const value = text.slice(0, lineStart) + prefixed + text.slice(lineEnd);
  return { value, selectionStart: lineStart, selectionEnd: lineStart + prefixed.length };
}

/** Paragraph/H1/H2/H3 — replaces any existing heading prefix on the current line rather than stacking a second one. */
function setHeading(text: string, start: number, level: 0 | 1 | 2 | 3): Update {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = text.indexOf("\n", start);
  if (lineEnd === -1) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  const stripped = line.replace(/^#{1,6}\s+/, "");
  const next = level === 0 ? stripped : `${"#".repeat(level)} ${stripped}`;
  const value = text.slice(0, lineStart) + next + text.slice(lineEnd);
  return { value, selectionStart: lineStart + next.length, selectionEnd: lineStart + next.length };
}

function insertAtCursor(text: string, start: number, end: number, snippet: string): Update {
  const value = text.slice(0, start) + snippet + text.slice(end);
  return { value, selectionStart: start + snippet.length, selectionEnd: start + snippet.length };
}

export function MarkdownToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  const apply = (fn: (text: string, start: number, end: number) => Update) => {
    const el = textareaRef.current;
    if (!el) return;
    const { value: next, selectionStart, selectionEnd } = fn(value, el.selectionStart, el.selectionEnd);
    onChange(next);
    // The DOM textarea's own value updates on React's next render — restoring
    // focus/selection has to wait a tick for that to land, or setSelectionRange
    // silently no-ops against the stale (pre-update) text length.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const promptUrl = (label: string): string | null => {
    const url = window.prompt(label);
    return url && url.trim() ? url.trim() : null;
  };

  const buttons: Array<{ icon: React.ReactNode; label: string; onClick: () => void } | "separator"> = [
    { icon: <Bold className="h-3.5 w-3.5" />, label: "Bold", onClick: () => apply((t, s, e) => wrapSelection(t, s, e, "**", "**", "bold text")) },
    { icon: <Italic className="h-3.5 w-3.5" />, label: "Italic", onClick: () => apply((t, s, e) => wrapSelection(t, s, e, "*", "*", "italic text")) },
    { icon: <Underline className="h-3.5 w-3.5" />, label: "Underline", onClick: () => apply((t, s, e) => wrapSelection(t, s, e, "<u>", "</u>", "underlined text")) },
    { icon: <Strikethrough className="h-3.5 w-3.5" />, label: "Strikethrough", onClick: () => apply((t, s, e) => wrapSelection(t, s, e, "~~", "~~", "struck text")) },
    "separator",
    { icon: <List className="h-3.5 w-3.5" />, label: "Bullet list", onClick: () => apply((t, s, e) => prefixLines(t, s, e, "- ")) },
    { icon: <ListOrdered className="h-3.5 w-3.5" />, label: "Numbered list", onClick: () => apply((t, s, e) => prefixLines(t, s, e, "1. ")) },
    { icon: <Quote className="h-3.5 w-3.5" />, label: "Quote", onClick: () => apply((t, s, e) => prefixLines(t, s, e, "> ")) },
    "separator",
    {
      icon: <LinkIcon className="h-3.5 w-3.5" />,
      label: "Link",
      onClick: () => {
        const url = promptUrl("Link URL");
        if (!url) return;
        apply((t, s, e) => wrapSelection(t, s, e, "[", `](${url})`, "link text"));
      },
    },
    {
      icon: <ImageIcon className="h-3.5 w-3.5" />,
      label: "Insert image (by URL)",
      onClick: () => {
        const url = promptUrl("Image URL");
        if (!url) return;
        apply((t, s, e) => insertAtCursor(t, s, e, `![](${url})`));
      },
    },
    {
      icon: <Video className="h-3.5 w-3.5" />,
      label: "Insert video (by URL)",
      onClick: () => {
        const url = promptUrl("Video URL");
        if (!url) return;
        apply((t, s, e) => insertAtCursor(t, s, e, `\n<video src="${url}" controls></video>\n`));
      },
    },
    {
      icon: <TableIcon className="h-3.5 w-3.5" />,
      label: "Insert table",
      onClick: () => apply((t, s, e) => insertAtCursor(t, s, e, "\n| Header | Header |\n| --- | --- |\n| Cell | Cell |\n")),
    },
    { icon: <Code className="h-3.5 w-3.5" />, label: "Code block", onClick: () => apply((t, s, e) => wrapSelection(t, s, e, "```\n", "\n```", "code")) },
    { icon: <Minus className="h-3.5 w-3.5" />, label: "Horizontal rule", onClick: () => apply((t, s, e) => insertAtCursor(t, s, e, "\n---\n")) },
    "separator",
    {
      icon: <Undo2 className="h-3.5 w-3.5" />,
      label: "Undo",
      onClick: () => {
        textareaRef.current?.focus();
        document.execCommand("undo");
      },
    },
    {
      icon: <Redo2 className="h-3.5 w-3.5" />,
      label: "Redo",
      onClick: () => {
        textareaRef.current?.focus();
        document.execCommand("redo");
      },
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 border-slate-200 bg-slate-50 px-2 py-1.5">
      <select
        aria-label="Paragraph style"
        className="mr-1 h-7 rounded border border-slate-200 bg-white px-1.5 text-xs"
        onChange={(e) => {
          const level = Number(e.target.value) as 0 | 1 | 2 | 3;
          const el = textareaRef.current;
          if (!el) return;
          apply((t, s) => setHeading(t, s, level));
          e.target.value = "";
        }}
        defaultValue=""
      >
        <option value="" disabled>Paragraph</option>
        <option value="0">Paragraph</option>
        <option value="1">Heading 1</option>
        <option value="2">Heading 2</option>
        <option value="3">Heading 3</option>
      </select>
      {buttons.map((b, i) =>
        b === "separator" ? (
          <div key={i} className="mx-1 h-5 w-px bg-slate-200" />
        ) : (
          <button
            key={b.label}
            type="button"
            title={b.label}
            aria-label={b.label}
            onClick={b.onClick}
            className="grid h-7 w-7 place-items-center rounded text-slate-600 hover:bg-slate-200 hover:text-slate-900"
          >
            {b.icon}
          </button>
        ),
      )}
    </div>
  );
}
