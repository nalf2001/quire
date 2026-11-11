import { PDFDocument } from "pdf-lib/es";
import { checkPageCount } from "./pdfInput";

const MAX_IMAGE_BYTES = 24 * 1024 * 1024;
const MAX_PIXELS = 20_000_000;
const MARGIN = 36;

export function removePages(source: Uint8Array, pages: number[]) {
  return PDFDocument.load(source, { updateMetadata: false }).then(async pdf => {
    const remove = [...new Set(pages)].filter(n => n >= 1 && n <= pdf.getPageCount()).sort((a, b) => b - a);
    if (!remove.length) throw new Error("Choose at least one page.");
    if (remove.length >= pdf.getPageCount()) throw new Error("A document needs at least one page. Close it instead.");
    for (const n of remove) pdf.removePage(n - 1);
    return pdf.save({ useObjectStreams: false });
  });
}

/** Result of inserting `file` (a PDF or a PNG/JPEG figure) after one-based page `after` (0 = at the start). */
export async function insertPagesFrom(source: Uint8Array, after: number, file: File) {
  if (file.size > MAX_IMAGE_BYTES * 12) throw new Error("That file is too large to insert.");
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await PDFDocument.load(source, { updateMetadata: false });
  if (after < 0 || after > pdf.getPageCount()) throw new Error("Choose where to insert the pages.");
  const isPdf = new TextDecoder().decode(data.subarray(0, 1024)).includes("%PDF-");
  let added: number;

  if (isPdf) {
    let from: PDFDocument;
    try {
      from = await PDFDocument.load(data, { updateMetadata: false });
    } catch {
      throw new Error("Couldn't read that PDF. Password-protected PDFs can't be inserted.");
    }
    const copied = await pdf.copyPages(from, from.getPageIndices());
    copied.forEach((page, i) => pdf.insertPage(after + i, page));
    added = copied.length;
  } else {
    // The figure gets a page the size of its neighbor.
    const neighbor = pdf.getPage(Math.max(0, Math.min(pdf.getPageCount() - 1, after - 1 < 0 ? 0 : after - 1)));
    const { width, height } = neighbor.getSize();
    await addImagePage(pdf, data, after, width, height);
    added = 1;
  }
  checkPageCount(pdf.getPageCount());
  return { bytes: await pdf.save({ useObjectStreams: false }), added };
}

/** Inserts a PNG/JPEG as one page of the given size, scaled down to fit inside a margin and centered. */
async function addImagePage(pdf: PDFDocument, data: Uint8Array, index: number, width: number, height: number) {
  if (data.length > MAX_IMAGE_BYTES) throw new Error("Choose an image smaller than 24 MB.");
  const jpeg = data[0] === 0xff && data[1] === 0xd8;
  const png = data.length >= 24 && new DataView(data.buffer, data.byteOffset).getUint32(0) === 0x89504e47;
  if (!jpeg && !png) throw new Error("Choose a PDF, PNG, or JPEG file.");
  if (png) {
    const header = new DataView(data.buffer, data.byteOffset);
    if (header.getUint32(16) * header.getUint32(20) > MAX_PIXELS) throw new Error("Choose an image under 20 megapixels.");
  }
  const image = jpeg ? await pdf.embedJpg(data) : await pdf.embedPng(data);
  if (image.width * image.height > MAX_PIXELS) throw new Error("Choose an image under 20 megapixels.");
  const scale = Math.min((width - 2 * MARGIN) / image.width, (height - 2 * MARGIN) / image.height, 1);
  const w = image.width * scale, h = image.height * scale;
  const page = pdf.insertPage(index, [width, height]);
  page.drawImage(image, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
}

const A4 = [595.28, 841.89] as const;

/** Builds one new PDF from PDFs and images, in the given order. */
export async function combineFiles(parts: { name: string; data: Uint8Array }[]) {
  if (!parts.length) throw new Error("Add at least one file.");
  const out = await PDFDocument.create();
  for (const part of parts) {
    try {
      if (new TextDecoder().decode(part.data.subarray(0, 1024)).includes("%PDF-")) {
        const from = await PDFDocument.load(part.data, { updateMetadata: false });
        for (const page of await out.copyPages(from, from.getPageIndices())) out.addPage(page);
      } else {
        await addImagePage(out, part.data, out.getPageCount(), A4[0], A4[1]);
      }
    } catch (e) {
      throw new Error(`“${part.name}”: ${e instanceof Error && e.message ? e.message : "couldn't be added."}`);
    }
    checkPageCount(out.getPageCount());
  }
  return out.save({ useObjectStreams: false });
}
