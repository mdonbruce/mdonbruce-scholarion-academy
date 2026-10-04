/**
 * Quiz calculator (parity §3.12). A small recursive-descent parser — never eval — for
 * basic (+ − × ÷, parentheses, %) and scientific (^, sqrt, sin, cos, tan, log, ln, abs, pi, e)
 * expressions. Rendered as its own small page so it works without client-side script and
 * never touches the quiz form.
 */

export type CalcMode = "basic" | "scientific";
const FUNCS: Record<string, (x: number) => number> = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, abs: Math.abs };

export function evaluate(expr: string, mode: CalcMode = "basic"): number {
  const src = String(expr ?? "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").trim();
  if (!src) throw new Error("Enter an expression.");
  if (src.length > 200) throw new Error("Expression is too long.");
  let i = 0;
  const peek = () => src[i];
  const ws = () => {
    while (src[i] === " ") i++;
  };
  const sci = mode === "scientific";
  function primary(): number {
    ws();
    if (peek() === "(") {
      i++;
      const v = sum();
      ws();
      if (src[i++] !== ")") throw new Error("Missing closing parenthesis.");
      return v;
    }
    if (peek() === "-") {
      i++;
      return -power();
    }
    if (peek() === "+") {
      i++;
      return power();
    }
    const num = /^(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      return Number(num[0]);
    }
    const word = /^[a-z]+/i.exec(src.slice(i));
    if (word) {
      const w = word[0].toLowerCase();
      if (!sci) throw new Error("Functions need the scientific calculator.");
      i += word[0].length;
      if (w === "pi") return Math.PI;
      if (w === "e") return Math.E;
      const f = FUNCS[w];
      if (!f) throw new Error(`Unknown function "${w}".`);
      ws();
      if (src[i++] !== "(") throw new Error(`Use ${w}( … ).`);
      const v = sum();
      ws();
      if (src[i++] !== ")") throw new Error("Missing closing parenthesis.");
      return f(v);
    }
    throw new Error(`Unexpected "${peek() ?? "end"}".`);
  }
  function postfix(): number {
    let v = primary();
    ws();
    while (peek() === "%") {
      i++;
      v = v / 100;
      ws();
    }
    return v;
  }
  function power(): number {
    const base = postfix();
    ws();
    if (peek() === "^") {
      if (!sci) throw new Error("Powers need the scientific calculator.");
      i++;
      return Math.pow(base, power()); // right-associative
    }
    return base;
  }
  function product(): number {
    let v = power();
    for (;;) {
      ws();
      const op = peek();
      if (op !== "*" && op !== "/") return v;
      i++;
      const r = power();
      if (op === "/" && r === 0) throw new Error("Can't divide by zero.");
      v = op === "*" ? v * r : v / r;
    }
  }
  function sum(): number {
    let v = product();
    for (;;) {
      ws();
      const op = peek();
      if (op !== "+" && op !== "-") return v;
      i++;
      const r = product();
      v = op === "+" ? v + r : v - r;
    }
  }
  const v = sum();
  ws();
  if (i < src.length) throw new Error(`Unexpected "${src[i]}".`);
  if (!Number.isFinite(v)) throw new Error("The result isn't a finite number.");
  return Math.round(v * 1e12) / 1e12;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function calculatorHtml(mode: CalcMode, expr: string) {
  let out = "";
  let err = "";
  if (expr) {
    try {
      out = String(evaluate(expr, mode));
    } catch (e) {
      err = (e as Error).message;
    }
  }
  const help = mode === "scientific" ? "+ − × ÷ ^ % ( ) sqrt sin cos tan log ln abs pi e" : "+ − × ÷ % ( )";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calculator</title><style>body{font:15px/1.4 system-ui,sans-serif;margin:8px;color:#10192f;background:#fff}form{display:flex;gap:6px;flex-wrap:wrap}input{flex:1;min-width:160px;font:inherit;padding:6px 8px;border:1px solid #6b7690;border-radius:6px}button{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #0b1f4d;background:#0b1f4d;color:#fff}output{display:block;margin-top:8px;font-size:1.3em;font-weight:700}.err{color:#a01818}.tiny{font-size:12px;color:#4a5672}@media (prefers-color-scheme:dark){body{background:#0b1220;color:#e6eaf3}input{background:#121a2c;color:#e6eaf3}.tiny{color:#b7c0d6}.err{color:#ff9b9b}}</style></head><body><form method="get" role="search" aria-label="${mode === "scientific" ? "Scientific" : "Basic"} calculator"><input type="hidden" name="mode" value="${mode}"><label class="tiny" for="x" style="width:100%">${mode === "scientific" ? "Scientific" : "Basic"} calculator — ${esc(help)}</label><input id="x" name="expr" value="${esc(expr)}" autocomplete="off" inputmode="decimal" maxlength="200"><button>=</button></form><output aria-live="polite"${err ? ' class="err"' : ""}>${esc(err || out)}</output></body></html>`;
}
