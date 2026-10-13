import Link from "next/link";
import type { ReactNode } from "react";

/*
 * Renders the small Markdown subset the docs use (lib/agentDocs.ts): headings, paragraphs,
 * lists, tables, fenced code, and inline code, bold and links. The docs are ours, not user input.
 */

/** Inline: `code`, **bold**, [text](href) */
function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${n++}`;
    if (t.startsWith("`")) {
      out.push(
        <code key={k} className="rounded-pills border border-carbon/20 bg-soft-mist px-1.5 py-0.5 font-mono text-[0.85em] break-words">
          {t.slice(1, -1)}
        </code>,
      );
    } else if (t.startsWith("**")) {
      out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    } else {
      const [, label, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!;
      const internal = href.startsWith("/");
      out.push(
        internal ? (
          <Link key={k} href={href} data-cuelume-navigate="" className="underline underline-offset-4">
            {label}
          </Link>
        ) : (
          <a key={k} href={href} className="underline underline-offset-4">
            {label}
          </a>
        ),
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let b = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = `b${b++}`;

    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key} className="overflow-x-auto rounded-cards border border-carbon bg-carbon p-5 font-mono text-caption leading-relaxed text-paper-white">
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      blocks.push(
        level === 1 ? (
          <h1 key={key} className="display-type text-[36px] sm:text-[48px] md:text-display-70">
            {h[2]}
          </h1>
        ) : level === 2 ? (
          <h2 key={key} className="pt-4 text-heading-sm font-bold">
            {inline(h[2], key)}
          </h2>
        ) : (
          <h3 key={key} className="text-subheading font-bold">
            {inline(h[2], key)}
          </h3>
        ),
      );
      i++;
      continue;
    }

    if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const [head, , ...body] = rows;
      const headCells = cells(head);
      blocks.push(
        <div key={key} className="overflow-x-auto rounded-cards border border-carbon bg-paper-white">
          <table className="w-full text-left text-caption">
            {headCells.some(Boolean) && (
              <thead>
                <tr>
                  {headCells.map((c, j) => (
                    <th key={j} className="label-type px-4 py-3 uppercase">
                      {inline(c, `${key}h${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-t border-carbon/15 align-top">
                  {cells(r).map((c, j) => (
                    <td key={j} className="px-4 py-3">
                      {inline(c, `${key}r${ri}c${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const bullet = /^(- |\d+\. )/;
    if (bullet.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];
      while (i < lines.length && bullet.test(lines[i])) items.push(lines[i++].replace(bullet, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key} className={`flex flex-col gap-2 pl-6 text-body-lg ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `${key}l${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }

    if (line.startsWith("> ")) {
      blocks.push(
        <p key={key} className="rounded-cards border border-carbon bg-lavender p-5 text-body-lg">
          {inline(line.slice(2), key)}
        </p>,
      );
      i++;
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#|\||```|- |\d+\. |> )/.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={key} className="max-w-3xl text-body-lg">
        {inline(para.join(" "), key)}
      </p>,
    );
  }

  return <div className="flex flex-col gap-5">{blocks}</div>;
}
