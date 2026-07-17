export function digitsOnly(v?: string | null): string {
  return (v ?? "").replace(/\D+/g, "");
}

export function formatPhoneBR(v?: string | null): string {
  const d = digitsOnly(v);
  if (!d) return "";
  // Brazil: 55 + DDD(2) + 9 digits
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? "";
}

export function whatsappLink(v?: string | null): string | null {
  const d = digitsOnly(v);
  if (d.length < 10) return null;
  const withCC = d.startsWith("55") || d.length > 11 ? d : `55${d}`;
  return `https://wa.me/${withCC}`;
}

export function telLink(v?: string | null): string | null {
  const d = digitsOnly(v);
  if (!d) return null;
  return `tel:+${d.startsWith("55") ? d : `55${d}`}`;
}