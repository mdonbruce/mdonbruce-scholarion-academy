import { calculatorHtml } from "@/campus/services/calculator";

/** Quiz calculator page (embedded in quiz-taking). Pure arithmetic; no data access, no scripts. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "scientific" ? "scientific" : "basic";
  const expr = (url.searchParams.get("expr") ?? "").slice(0, 200);
  return new Response(calculatorHtml(mode, expr), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'", "x-content-type-options": "nosniff" },
  });
}
