/**
 * QR codes for credential verification links. Uses the `qrcode` package when installed;
 * falls back to a labelled placeholder so the page never breaks.
 */
const QR = {
  async svg(text: string): Promise<string> {
    try {
      const mod = (await import("qrcode")) as unknown as { toString: (t: string, o: Record<string, unknown>) => Promise<string>; default?: { toString: (t: string, o: Record<string, unknown>) => Promise<string> } };
      const lib = mod.default ?? mod;
      return await lib.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b1f4d", light: "#ffffff" } });
    } catch {
      const safe = text.replace(/[<>&"]/g, "");
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="Verification link"><rect width="120" height="120" rx="8" fill="#fff" stroke="#0b1f4d"/><text x="60" y="56" font-size="10" text-anchor="middle" fill="#0b1f4d">Scan to verify</text><text x="60" y="72" font-size="6" text-anchor="middle" fill="#0b1f4d">${safe.slice(-28)}</text></svg>`;
    }
  },
};
export default QR;
