"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AppIcon } from "./app-icon";

/** Keep the working record visible until the user deliberately opens an editor. */
export function WorkspaceEditor({ title, editing = false, request = 0, completed = 0, children }: { title: string; editing?: boolean; request?: number; completed?: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const lastCompleted = useRef(completed);
  useEffect(() => { if (editing) setOpen(true); }, [editing, request]);
  useEffect(() => { if (lastCompleted.current !== completed) { setOpen(false); lastCompleted.current = completed; } }, [completed]);
  return <section className={open ? "workspace-editor is-open" : "workspace-editor"}>
    <button className="editor-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><AppIcon name={open ? "close" : "plus"} /><span>{open ? "Hide editor" : title}</span>{!open && <AppIcon name="arrow" />}</button>
    {open && <div id={id}>{children}</div>}
  </section>;
}
