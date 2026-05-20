/** Утилиты, разделяемые между UI-модулями. */

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_');
}

export function suggestCleanName(originalName: string, outputExt: string): string {
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.substring(0, dot) : originalName;
  return safeFileName(`${base}_clean.${outputExt}`);
}

export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Partial<{
    className: string;
    text: string;
    html: string;
    attrs: Record<string, string>;
    onClick: (e: MouseEvent) => void;
  }>,
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props?.className) node.className = props.className;
  if (props?.text !== undefined) node.textContent = props.text;
  if (props?.html !== undefined) node.innerHTML = props.html;
  if (props?.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  }
  if (props?.onClick) node.addEventListener('click', props.onClick);
  for (const c of children) {
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}
