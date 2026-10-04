import { useMemo, useRef, useState } from "react";
import "./App.css";

type MemoryRegion = { name: string; origin: number; length: number; flags: string };
type OutputSection = {
  name: string;
  region: string;
  size: number;
  align: number;
  line: number;
  address: number;
  padding: number;
};
type Finding = { kind: "error" | "warning" | "success"; title: string; detail: string };

const initialScript = `/* LinkLens · demo linker script */
MEMORY
{
  FLASH (rx)  : ORIGIN = 0x00000000, LENGTH = 128K
  RAM   (rwx) : ORIGIN = 0x80000000, LENGTH = 64K
}

SECTIONS
{
  .text :
  {
    *(.text*)
  } > FLASH

  .rodata :
  {
    *(.rodata*)
  } > FLASH

  .data : ALIGN(64)
  {
    *(.data*)
  } > RAM

  .bss :
  {
    *(.bss*)
  } > RAM
}`;

const demoSizes: Record<string, number> = {
  ".text": 45_312,
  ".rodata": 12_288,
  ".data": 3_072,
  ".bss": 8_704,
};

function parseNumber(input: string): number {
  const value = input.trim().replace(/[;,]$/, "");
  const match = value.match(/^(0x[\da-f]+|\d+)\s*([kmgt]?)$/i);
  if (!match) return 0;
  const base = Number(match[1]);
  const power = { "": 0, K: 1, M: 2, G: 3, T: 4 }[match[2].toUpperCase()] ?? 0;
  return base * 1024 ** power;
}

function parseLinkerScript(source: string) {
  const regions: MemoryRegion[] = [];
  const memoryBlock = source.match(/\bMEMORY\s*\{([\s\S]*?)\}/i)?.[1] ?? "";
  for (const line of memoryBlock.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*(?:\(([^)]*)\))?\s*:\s*ORIGIN\s*=\s*([^,]+),\s*LENGTH\s*=\s*([^\s;]+)/i);
    if (match) regions.push({ name: match[1], flags: match[2] ?? "", origin: parseNumber(match[3]), length: parseNumber(match[4]) });
  }

  const sections: OutputSection[] = [];
  const sectionPattern = /(^\s*([.\w-]+)\s*(?:0x[\da-f]+\s*)?:\s*(?:ALIGN\s*\(\s*([^)]*)\s*\)\s*)?\{([\s\S]*?)\}\s*>\s*([\w.-]+))/gim;
  for (const match of source.matchAll(sectionPattern)) {
    const name = match[2];
    const body = match[4];
    const align = parseNumber(match[3] ?? "1") || 1;
    const size = demoSizes[name] ?? (body.match(/\*\s*\([^)]*\)/g)?.length ?? 1) * 1024;
    sections.push({ name, region: match[5], size, align, line: source.slice(0, match.index).split("\n").length, address: 0, padding: 0 });
  }

  const cursors = new Map(regions.map((region) => [region.name, region.origin]));
  const placements = sections.map((section) => {
    const region = regions.find((item) => item.name === section.region);
    const cursor = cursors.get(section.region) ?? region?.origin ?? 0;
    const remainder = cursor % section.align;
    const padding = remainder === 0 ? 0 : section.align - remainder;
    const address = cursor + padding;
    cursors.set(section.region, address + section.size);
    return { ...section, address, padding };
  });

  const findings: Finding[] = [];
  if (!regions.length) findings.push({ kind: "error", title: "MEMORY block not found", detail: "Add at least one memory region with ORIGIN and LENGTH." });
  if (!sections.length) findings.push({ kind: "warning", title: "No mapped output sections", detail: "Add output sections inside SECTIONS and assign them to a region." });
  for (const section of placements) {
    if (!regions.some((region) => region.name === section.region)) {
      findings.push({ kind: "error", title: `${section.name} uses an unknown region`, detail: `The region “${section.region}” is not defined in MEMORY.` });
    }
    if (section.padding) findings.push({ kind: "warning", title: `${section.name} needs ${section.padding} B of alignment padding`, detail: `ALIGN(${section.align}) advances the section start to ${hex(section.address)}.` });
  }
  for (const region of regions) {
    const usedEnd = cursors.get(region.name) ?? region.origin;
    const used = usedEnd - region.origin;
    if (used > region.length) findings.push({ kind: "error", title: `${region.name} region overflow`, detail: `Sections exceed the region by ${formatBytes(used - region.length)}.` });
  }
  if (!findings.some((finding) => finding.kind === "error")) {
    findings.unshift({ kind: "success", title: "Memory regions are within bounds", detail: "All mapped sections fit in their assigned regions." });
  }
  return { regions, sections: placements, findings };
}

function hex(value: number) {
  return `0x${Math.max(0, value).toString(16).toUpperCase().padStart(8, "0")}`;
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(value % 1024 ? 1 : 0)} KB`;
  return `${value} B`;
}

function sectionSourceRange(source: string, section: OutputSection) {
  const start = source.split("\n").slice(0, section.line - 1).reduce((sum, line) => sum + line.length + 1, 0);
  const open = source.indexOf("{", start);
  if (open < 0) return { start, end: source.indexOf("\n", start) < 0 ? source.length : source.indexOf("\n", start), startLine: section.line - 1, endLine: section.line - 1 };
  let depth = 0;
  let close = open;
  for (; close < source.length; close += 1) {
    if (source[close] === "{") depth += 1;
    if (source[close] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const newline = source.indexOf("\n", close);
  const end = newline < 0 ? source.length : newline;
  const endLine = source.slice(0, end).split("\n").length - 1;
  return { start, end, startLine: section.line - 1, endLine };
}

function highlightedSource(source: string, highlightedLines: { startLine: number; endLine: number } | null) {
  const tokenPattern = /(\/\*.*?\*\/|\/\/[^\n]*|\b(?:MEMORY|SECTIONS|ORIGIN|LENGTH|ALIGN)\b|\.[\w.-]+|0x[\da-f]+|\b\d+[KMG]?\b|[{}():>,])/gi;
  const highlightLine = (line: string) => {
  const tokens: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of line.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push(line.slice(cursor, index));
    const token = match[0];
    const kind = token.startsWith("/*") || token.startsWith("//") ? "syntax-comment"
      : /^(MEMORY|SECTIONS|ORIGIN|LENGTH|ALIGN)$/i.test(token) ? "syntax-keyword"
      : token.startsWith(".") ? "syntax-section"
      : /^(0x|\d)/i.test(token) ? "syntax-number" : "syntax-punctuation";
    tokens.push(<span className={kind} key={`${index}-${token}`}>{token}</span>);
    cursor = index + token.length;
  }
  if (cursor < line.length) tokens.push(line.slice(cursor));
  return tokens;
  };
  return source.split("\n").map((line, index) => <span key={`line-${index}`} className={`code-line ${highlightedLines && index >= highlightedLines.startLine && index <= highlightedLines.endLine ? "code-line-active" : ""}`}>{highlightLine(line)}{"\n"}</span>);
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const shared = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, React.ReactNode> = {
    code: <><path d="m8 6-6 6 6 6M16 6l6 6-6 6M14 4l-4 16" /></>,
    map: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16M3 9h6M15 15h6"/></>,
    chart: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-5 3 2 6-7"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.6-1.4-2.4 1.4-1.1a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1 0 2Z" transform="translate(-1 -1) scale(.95)"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    down: <path d="m7 10 5 5 5-5"/>,
    run: <path d="m8 5 12 7-12 7z" fill="currentColor" stroke="none"/>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    warning: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    x: <path d="m18 6-12 12M6 6l12 12"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    expand: <><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
  };
  return <svg {...shared}>{paths[name] ?? paths.file}</svg>;
}

function App() {
  const [source, setSource] = useState(initialScript);
  const [activeSection, setActiveSection] = useState(".text");
  const [lastAnalyzed, setLastAnalyzed] = useState("A moment ago");
  const [isSaved, setIsSaved] = useState(true);
  const [toast, setToast] = useState("");
  const [editorWidth, setEditorWidth] = useState(43);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [sectionLayout, setSectionLayout] = useState<"vertical" | "horizontal">("vertical");
  const [lightTheme, setLightTheme] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysis = useMemo(() => parseLinkerScript(source), [source]);
  const lineCount = Math.max(1, source.split("\n").length);
  const diagnostics = analysis.findings;
  const errorCount = diagnostics.filter((item) => item.kind === "error").length;
  const warningCount = diagnostics.filter((item) => item.kind === "warning").length;
  const activeSectionInfo = analysis.sections.find((section) => section.name === activeSection);
  const activeRange = activeSectionInfo ? sectionSourceRange(source, activeSectionInfo) : null;
  const diagramHeight = Math.max(560, 90 + analysis.regions.reduce((sum, region) => {
    const items = analysis.sections.filter((section) => section.region === region.name);
    const used = items.reduce((total, section) => total + section.size + section.padding, 0);
    return sum + Math.max(178, 92 + items.length * 90 + (region.length > used ? 50 : 0));
  }, 0));

  const flashToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const analyze = () => {
    setLastAnalyzed("Just now");
    flashToast(errorCount ? `Analysis complete · ${errorCount} issue${errorCount > 1 ? "s" : ""} found` : "Analysis complete · layout is within bounds");
  };

  const jumpToSection = (section: OutputSection) => {
    setActiveSection(section.name);
    const editor = editorRef.current;
    if (!editor) return;
    const { start } = sectionSourceRange(source, section);
    editor.focus();
    editor.setSelectionRange(start, start);
    editor.scrollTop = Math.max(0, (section.line - 5) * 22);
  };

  const saveFile = () => {
    const blob = new Blob([source], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "linker.ld";
    link.click();
    URL.revokeObjectURL(url);
    setIsSaved(true);
    flashToast("Linker script saved as linker.ld");
  };

  const openFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSource(String(reader.result ?? ""));
      setIsSaved(true);
      flashToast(`Opened ${file.name}`);
    };
    reader.readAsText(file);
  };

  const resizeSplit = (clientX: number, element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    setEditorWidth(Math.min(68, Math.max(28, ((clientX - bounds.left) / bounds.width) * 100)));
  };

  return (
    <div className={`app-shell ${lightTheme ? "theme-light" : ""}`}>
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-mark"><span/><span/><span/></div><div><div className="brand-name">linklens<span className="brand-period">.</span></div><div className="brand-subtitle">LINKER SCRIPT STUDIO</div></div></div>
        <div className="topbar-file"><span className="file-diamond">◈</span><span>linker.ld</span><span className="file-unsaved">{isSaved ? "" : "•"}</span></div>
        <div className="topbar-actions">
          <button className="button button-secondary theme-toggle" onClick={() => setLightTheme(!lightTheme)} aria-label={`Switch to ${lightTheme ? "dark" : "light"} theme`} title={`Switch to ${lightTheme ? "dark" : "light"} theme`}>{lightTheme ? "☾" : "☼"}<span>{lightTheme ? "Dark" : "Light"}</span></button>
          <span className="save-state"><span className={`save-dot ${isSaved ? "" : "save-dot-dirty"}`}/>{isSaved ? "Saved" : "Unsaved"}</span>
          <button className="button button-secondary" onClick={() => fileInputRef.current?.click()}><Icon name="file" size={15}/> Open</button>
          <input ref={fileInputRef} className="visually-hidden" type="file" accept=".ld,.lds,.txt" onChange={(event) => openFile(event.target.files?.[0])}/>
          <button className="button button-secondary" onClick={saveFile}><Icon name="save" size={15}/> Save</button>
          <button className="button button-primary" onClick={analyze}><Icon name="run" size={14}/> Analyze <span className="shortcut">⌘ ↵</span></button>
        </div>
      </header>

      <main className="studio">
        <div className="split-toolbar" style={{ gridTemplateColumns: `${editorWidth}% 14px minmax(0, 1fr)` }}>
          <div className="pane-heading"><span className="pane-icon editor-glyph"><Icon name="code" size={15}/></span><div><strong>Linker script</strong><span>GNU LD · {lineCount} lines</span></div></div>
          <div className="split-toolbar-gutter" aria-hidden="true" />
          <div className="pane-heading canvas-heading"><span className="pane-icon canvas-glyph"><Icon name="map" size={15}/></span><div><strong>Memory layout</strong><span>{sectionLayout === "vertical" ? "Stacked · linker order" : "Side by side · size scaled"}</span></div><span className="canvas-last-run">Analyzed {lastAnalyzed}</span></div>
        </div>

        <div className="split-workspace" style={{ gridTemplateColumns: `${editorWidth}% 14px minmax(0, 1fr)` }} onPointerMove={(event) => { if (draggingSplit) resizeSplit(event.clientX, event.currentTarget); }} onPointerUp={() => setDraggingSplit(false)}>
          <section className="editor-pane" aria-label="Linker script editor">
            <div className="editor-tabs"><div className="editor-tab active-tab"><span className="file-diamond">◈</span> linker.ld <span className="tab-modified">{isSaved ? "" : "●"}</span></div></div>
            <div className="editor-meta"><span><span className="meta-live-dot"/> Editing</span><span>UTF-8 <i>·</i> LF <i>·</i> GNU LD</span></div>
            <div className="editor-surface">
              <div className="line-numbers" aria-hidden="true">{Array.from({ length: lineCount }, (_, index) => <span key={index} className={activeRange && index >= activeRange.startLine && index <= activeRange.endLine ? "active-line-number" : ""}>{String(index + 1).padStart(2, "0")}</span>)}</div>
              <pre className="code-highlight" aria-hidden="true">{highlightedSource(source, activeRange)}</pre>
              <textarea ref={editorRef} className="code-input" aria-label="Linker script source" spellCheck={false} autoCapitalize="off" autoComplete="off" value={source} onScroll={(event) => { const pre = event.currentTarget.parentElement?.querySelector(".code-highlight") as HTMLPreElement | null; if (pre) { pre.scrollTop = event.currentTarget.scrollTop; pre.scrollLeft = event.currentTarget.scrollLeft; } }} onChange={(event) => { setSource(event.target.value); setIsSaved(false); }} onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); analyze(); }
                if (event.key === "Tab") { event.preventDefault(); const target = event.currentTarget; const start = target.selectionStart; const end = target.selectionEnd; setSource(source.slice(0, start) + "  " + source.slice(end)); setIsSaved(false); requestAnimationFrame(() => target.setSelectionRange(start + 2, start + 2)); }
              }}/>
            </div>
            <div className="editor-status"><span><b/> Live parse</span><span>Ln 1, Col 1</span><span>Spaces: 2</span></div>
          </section>

          <div className={`split-handle ${draggingSplit ? "split-dragging" : ""}`} role="separator" aria-label="Resize editor and memory canvas" aria-orientation="vertical" onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDraggingSplit(true); }} onPointerUp={() => setDraggingSplit(false)} onDoubleClick={() => setEditorWidth(43)}><span/><span/><span/></div>

          <section className="canvas-pane" aria-label="Visual memory map">
            <div className="canvas-toolbar"><div className="canvas-toolbar-label"><span className="canvas-live-dot"/> LIVE MAP <span className="canvas-counts">{analysis.regions.length} regions · {analysis.sections.length} sections</span></div><div className="canvas-actions"><div className="layout-toggle" role="group" aria-label="Section layout"><button className={`canvas-tool ${sectionLayout === "vertical" ? "tool-active" : ""}`} title="Stack sections" aria-label="Stack sections" onClick={() => setSectionLayout("vertical")}><span>↕</span></button><button className={`canvas-tool ${sectionLayout === "horizontal" ? "tool-active" : ""}`} title="Arrange sections side by side" aria-label="Arrange sections side by side" onClick={() => setSectionLayout("horizontal")}><span>↔</span></button></div><span className="toolbar-rule"/><span className="scale-label">{Math.round(zoom * 100)}%</span><button className="canvas-tool" title="Zoom out" onClick={() => setZoom(Math.max(.7, zoom - .1))}>−</button><button className="canvas-tool" title="Zoom in" onClick={() => setZoom(Math.min(1.5, zoom + .1))}>+</button><span className="toolbar-rule"/><button className="canvas-tool fit-tool" title="Fit canvas" onClick={() => setZoom(1)}><Icon name="expand" size={15}/></button></div></div>
            <div className="diagram-scroll"><div className="diagram-stage" style={{ transform: `scale(${zoom})` }}>
              <svg className="memory-diagram" viewBox={`0 0 960 ${sectionLayout === "vertical" ? diagramHeight : 560}`} role="img" aria-label="Memory region diagram with section blocks scaled by size">
                <defs>
                  <pattern id="dot-grid" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#303541"/></pattern>
                  <pattern id="padding-grid" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="7" fill="#9f8654" opacity=".46"/></pattern>
                  <filter id="selected-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/></filter>
                  <marker id="flow-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 7 3.5 0 7Z" fill="#697386"/></marker>
                </defs>
                <rect width="960" height={sectionLayout === "vertical" ? diagramHeight : 560} fill="url(#dot-grid)"/>
                <text x="28" y="34" className="diagram-caption">ADDRESS SPACE</text>
                <text x="930" y="34" textAnchor="end" className="diagram-caption">{sectionLayout === "vertical" ? "SECTIONS · LINKER ORDER" : "BOX WIDTH ∝ MEMORY SIZE"}</text>
                {analysis.regions.length === 0 && <g><rect x="250" y="170" width="430" height="150" rx="12" className="diagram-empty-box"/><text x="465" y="235" textAnchor="middle" className="diagram-empty-title">No memory regions yet</text><text x="465" y="260" textAnchor="middle" className="diagram-empty-note">Add MEMORY {"{"} ... {"}"} to the script</text></g>}
                {(() => {
                  const maxLength = Math.max(1, ...analysis.regions.map((region) => region.length));
                  const maxWidth = 790;
                  const regionHeight = (regionName: string) => {
                    if (sectionLayout !== "vertical") return 214;
                    const items = analysis.sections.filter((section) => section.region === regionName);
                    const region = analysis.regions.find((item) => item.name === regionName);
                    const usedBytes = items.reduce((sum, section) => sum + section.size + section.padding, 0);
                    const hasFree = !!region && region.length > usedBytes;
                    return Math.max(178, 92 + items.length * 90 + (hasFree ? 50 : 0));
                  };
                  return analysis.regions.map((region, regionIndex) => {
                    const mapped = analysis.sections.filter((section) => section.region === region.name);
                    const padding = mapped.reduce((sum, section) => sum + section.padding, 0);
                    const used = mapped.reduce((sum, section) => sum + section.size + section.padding, 0);
                    const free = Math.max(0, region.length - used);
                    const utilization = region.length ? Math.min(100, used / region.length * 100) : 0;
                    const width = Math.max(310, maxWidth * region.length / maxLength);
                    const x = 110;
                    const y = 72 + analysis.regions.slice(0, regionIndex).reduce((sum, previous) => sum + regionHeight(previous.name), 0);
                    const innerX = x + 13;
                    const innerWidth = width - 26;
                    const minSectionWidth = mapped.length ? Math.min(64, innerWidth / Math.max(1, mapped.length + 1)) : 0;
                    const sectionWidths = mapped.map((section) => sectionLayout === "vertical" ? innerWidth : Math.max(minSectionWidth, innerWidth * section.size / Math.max(1, region.length)));
                    const paddingWidth = padding ? Math.max(7, innerWidth * padding / Math.max(1, region.length)) : 0;
                    const nodeGap = mapped.length > 1 ? 12 : 0;
                    const sectionTotal = sectionWidths.reduce((sum, value) => sum + value, 0) + paddingWidth + nodeGap * Math.max(0, mapped.length - 1);
                    const overflowScale = sectionTotal > innerWidth ? innerWidth / sectionTotal : 1;
                    const actualSections = sectionWidths.map((value) => value * overflowScale);
                    const actualPadding = paddingWidth * overflowScale;
                    const freeWidth = Math.max(0, innerWidth - actualSections.reduce((sum, value) => sum + value, 0) - actualPadding);
                    let cursorX = innerX;
                    const sectionRects = mapped.map((section, sectionIndex) => {
                      const slotWidth = actualSections[sectionIndex];
                      const boxWidth = sectionLayout === "vertical" ? innerWidth : Math.max(30, slotWidth - (sectionIndex < mapped.length - 1 ? nodeGap : 0));
                      const boxX = sectionLayout === "vertical" ? innerX : cursorX;
                      const boxY = sectionLayout === "vertical" ? y + 72 + sectionIndex * 90 : y + 73;
                      if (sectionLayout === "horizontal") cursorX += slotWidth;
                      const isFlash = regionIndex === 0;
                      const chosen = section.name === activeSection;
                      return <g key={section.name} className={`diagram-section ${isFlash ? "diagram-flash" : "diagram-ram"} diagram-section-tone-${sectionIndex % 4} ${chosen ? "diagram-selected" : ""}`} onClick={() => jumpToSection(section)} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && jumpToSection(section)}>
                        <title>{`${section.name} · ${formatBytes(section.size)} · ${hex(section.address)}`}</title>
                        {chosen && <rect x={boxX - 2} y={boxY - 2} width={Math.max(1, boxWidth + 4)} height="74" rx="5" className="diagram-selection-glow"/>}
                        <rect x={boxX} y={boxY} width={Math.max(1, boxWidth)} height="70" rx="3" className="diagram-box"/>
                        <rect x={boxX} y={boxY} width="4" height="70" rx="2" className="diagram-accent"/>
                        {boxWidth > 46 && <text x={boxX + 13} y={boxY + 22} className="diagram-section-name">{section.name}</text>}
                        {boxWidth > 94 && <text x={boxX + 13} y={boxY + 42} className="diagram-section-address">{hex(section.address)}</text>}
                        {boxWidth > 65 && <text x={boxX + 13} y={boxY + 59} className="diagram-section-size">{formatBytes(section.size)}</text>}
                      </g>;
                    });
                    const connectors = mapped.slice(0, -1).map((section, index) => {
                      if (sectionLayout === "vertical") {
                        const center = innerX + innerWidth / 2;
                        const fromY = y + 72 + index * 90 + 70;
                        return <path key={`${section.name}-connector`} d={`M ${center} ${fromY} V ${fromY + 17}`} className="diagram-connector" markerEnd="url(#flow-arrow)"/>;
                      }
                      const x1 = innerX + actualSections.slice(0, index + 1).reduce((sum, value) => sum + value, 0) - nodeGap;
                      const x2 = x1 + nodeGap - 3;
                      return <path key={`${section.name}-connector`} d={`M ${x1 + 1} ${y + 115} H ${x2}`} className="diagram-connector" markerEnd="url(#flow-arrow)"/>;
                    });
                    const paddingX = cursorX;
                    cursorX += actualPadding;
                    const freeX = cursorX;
                    const isFlash = regionIndex === 0;
                    return <g key={region.name} className="diagram-region">
                      <rect x={x} y={y} width={width} height={regionHeight(region.name) - 8} rx="9" className="diagram-region-frame"/>
                      <rect x={x + 1} y={y + 1} width="4" height={regionHeight(region.name) - 10} rx="2" className={isFlash ? "region-edge-flash" : "region-edge-ram"}/>
                      <circle cx={x + 22} cy={y + 23} r="5" className={isFlash ? "region-dot-flash" : "region-dot-ram"}/>
                      <text x={x + 36} y={y + 27} className="diagram-region-name">{region.name}</text>
                      <text x={x + 106} y={y + 27} className="diagram-region-flags">{region.flags || "memory"}</text>
                      <text x={x + 15} y={y + 51} className="diagram-address">{hex(region.origin)}</text>
                      <text x={x + width - 15} y={y + 23} textAnchor="end" className="diagram-capacity">{formatBytes(region.length)}</text>
                      <text x={x + width - 15} y={y + 48} textAnchor="end" className={`diagram-usage ${isFlash ? "" : "ram-usage"}`}>{formatBytes(used)} used · {utilization.toFixed(1)}%</text>
                      {connectors}{sectionRects}
                      {padding > 0 && sectionLayout === "horizontal" && <g><rect x={paddingX} y={y + 73} width={actualPadding} height="70" fill="url(#padding-grid)" stroke="#9f8654" strokeDasharray="3 3"/><title>{formatBytes(padding)} alignment padding</title></g>}
                      {free > 0 && <g className="diagram-free"><rect x={sectionLayout === "vertical" ? innerX : freeX} y={sectionLayout === "vertical" ? y + 72 + mapped.length * 90 : y + 73} width={sectionLayout === "vertical" ? innerWidth : freeWidth} height={sectionLayout === "vertical" ? 38 : 70} rx="3" className="diagram-free-box"/>{(sectionLayout === "vertical" ? innerWidth : freeWidth) > 84 && <><text x={(sectionLayout === "vertical" ? innerX : freeX) + 11} y={sectionLayout === "vertical" ? y + 96 + mapped.length * 90 : y + 103} className="diagram-free-title">Free space</text><text x={sectionLayout === "vertical" ? innerX + innerWidth - 10 : freeX + 11} y={sectionLayout === "vertical" ? y + 96 + mapped.length * 90 : y + 126} textAnchor={sectionLayout === "vertical" ? "end" : "start"} className="diagram-free-size">{formatBytes(free)} available</text></>}</g>}
                      <line x1={x + 13} y1={y + regionHeight(region.name) - 31} x2={x + width - 13} y2={y + regionHeight(region.name) - 31} className="diagram-divider"/>
                      <text x={x + 13} y={y + regionHeight(region.name) - 20} className="diagram-foot-address">{hex(region.origin)}</text>
                      <text x={x + width - 13} y={y + regionHeight(region.name) - 20} textAnchor="end" className="diagram-foot-address">{hex(region.origin + region.length - 1)}</text>
                    </g>;
                  });
                })()}
              </svg>
            </div></div>
            <div className="canvas-legend"><span><i className="legend-chip-flash"/> FLASH</span><span><i className="legend-chip-ram"/> RAM</span><span><i className="legend-chip-pad"/> Padding</span><span><i className="legend-chip-free"/> Free</span><span className="legend-note">Section widths use demo estimates until ELF analysis is connected.</span></div>
          </section>
        </div>

        <section className={`diagnostics-drawer ${showDiagnostics ? "diagnostics-open" : ""}`}>
          <button className="diagnostics-toggle" onClick={() => setShowDiagnostics(!showDiagnostics)}><span className="diagnostics-toggle-left"><Icon name="warning" size={15}/><strong>Diagnostics</strong><span className="diagnostic-count">{diagnostics.length}</span><span className={errorCount ? "text-error" : "text-good"}>{errorCount ? `${errorCount} errors` : "No errors"}</span><span className="diagnostic-muted">· {warningCount} warnings</span></span><Icon name="down" size={15}/></button>
          {showDiagnostics && <div className="diagnostics-list">{diagnostics.map((finding, index) => <div className="diagnostic-row" key={`${finding.title}-${index}`}><span className={`diagnostic-mark ${finding.kind}`}/><div><strong>{finding.title}</strong><small>{finding.detail}</small></div><button onClick={() => { const match = analysis.sections.find((section) => finding.title.includes(section.name)); if (match) jumpToSection(match); else { editorRef.current?.focus(); editorRef.current?.setSelectionRange(0, 6); } }}>View in script <Icon name="chevron" size={13}/></button></div>)}</div>}
        </section>
        <footer className="statusbar"><span><i/> Ready</span><span>{analysis.regions.length} regions <b>·</b> {analysis.sections.length} sections <b>·</b> {lineCount} lines</span><span>GNU ld preview</span></footer>
      </main>
      {toast && <div className="toast-message"><span><Icon name="check" size={15}/></span>{toast}</div>}
    </div>
  );
}

export default App;
