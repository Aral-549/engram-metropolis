// Renders an agent reply's formatting (contracts/ui.md U32, U33) from parsed data. React text nodes only: no HTML.
import { Fragment } from "react";
import { parseReply, type Inline } from "@/lib/markdown";

function Inl({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.t === "b" ? <strong key={i}>{p.v}</strong>
          : p.t === "i" ? <em key={i}>{p.v}</em>
            : p.t === "code" ? <code key={i} className="rounded bg-ink/10 px-1 font-mono text-[0.9em]">{p.v}</code>
              : <Fragment key={i}>{p.v}</Fragment>,
      )}
    </>
  );
}

export function ReplyText({ text }: { text: string }) {
  return (
    <div className="space-y-2.5 leading-relaxed">
      {parseReply(text).map((b, i) =>
        b.type === "h" ? <p key={i} className="font-bold"><Inl parts={b.inl} /></p>
          : b.type === "hr" ? <hr key={i} className="border-t-2 border-ink/15" />
            : b.type === "p" ? <p key={i}>{b.lines.map((l, k) => <Fragment key={k}>{k ? <br /> : null}<Inl parts={l} /></Fragment>)}</p>
              : b.type === "ul" ? <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((it, k) => <li key={k}><Inl parts={it} /></li>)}</ul>
                : <ol key={i} className="list-decimal space-y-1 pl-5">{b.items.map((it, k) => <li key={k}><Inl parts={it} /></li>)}</ol>,
      )}
    </div>
  );
}
