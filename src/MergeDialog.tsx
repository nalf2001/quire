import { useRef, useState } from "react";
import { Modal, formatBytes } from "./Dialogs";
import { Icon } from "./icons";
import { combineFiles } from "./pageEdit";

const WORD_FILE = /\.docx?$/i;

interface Item { id: number; file: File }

/** Builds a new PDF from several PDFs, images and Word documents. Word files need the desktop app (it converts them). */
export function MergeDialog({ onCreate, onClose }: { onCreate: (name: string, data: Uint8Array) => void; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const next = useRef(1);
  const canWord = !!window.folioDesktop;

  const add = (files: FileList | null) => {
    if (!files) return;
    const added: Item[] = [];
    let skipped = 0;
    for (const file of files) {
      if (WORD_FILE.test(file.name) && !canWord) skipped++;
      else added.push({ id: next.current++, file });
    }
    setItems(list => [...list, ...added]);
    setError(skipped ? "Word documents can only be combined in the Quire desktop app." : null);
  };
  const move = (i: number, by: number) => setItems(list => {
    const j = i + by;
    if (j < 0 || j >= list.length) return list;
    const copy = list.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });

  const create = async () => {
    if (busy || !items.length) return;
    setBusy(true);
    setError(null);
    try {
      const parts: { name: string; data: Uint8Array }[] = [];
      for (const { file } of items) {
        if (WORD_FILE.test(file.name)) {
          const converted = await window.folioDesktop!.openDocument(file);
          parts.push({ name: file.name, data: new Uint8Array(converted.data) });
        } else {
          parts.push({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
        }
      }
      const data = await combineFiles(parts);
      onCreate("Combined.pdf", data);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't create the PDF.");
      setBusy(false);
    }
  };

  return (
    <Modal title="Create PDF from files" onClose={busy ? () => {} : onClose}>
      <div className="password-form merge-form">
        <p>Add PDFs, images (PNG, JPEG){canWord ? ", and Word documents" : ""}. Each image becomes one page. They are combined in the order shown.</p>
        <ol className="merge-list">
          {items.map((item, i) => (
            <li key={item.id}>
              <span className="merge-name" title={item.file.name}>{item.file.name}</span>
              <span className="merge-size">{formatBytes(item.file.size)}</span>
              <button type="button" className="link small" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${item.file.name} up`}>↑</button>
              <button type="button" className="link small" disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${item.file.name} down`}>↓</button>
              <button type="button" className="link small" disabled={busy} onClick={() => setItems(list => list.filter(x => x !== item))} aria-label={`Remove ${item.file.name}`}>
                <Icon name="close" size={13} />
              </button>
            </li>
          ))}
        </ol>
        <input ref={input} type="file" multiple hidden
          accept={`application/pdf,.pdf,image/png,image/jpeg,.png,.jpg,.jpeg${canWord ? ",.docx,.doc" : ""}`}
          onChange={e => { add(e.target.files); e.target.value = ""; }} />
        <button type="button" className="btn ghost" disabled={busy} onClick={() => input.current?.click()}>Add files…</button>
        {error && <p className="form-error">{error}</p>}
        {busy && <p role="status">Combining… Word documents can take a few seconds each.</p>}
        <div className="form-actions">
          <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy || !items.length} onClick={() => void create()}>
            {busy ? "Creating…" : "Create PDF"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
