export function formatSalary(min: number | null, max: number | null, currency = "USD") {
  if (!min && !max) return "Salary undisclosed";
  const f = (n: number) => {
    const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "";
    return sym + (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
  };
  if (min && max) return `${f(min)} – ${f(max)}`;
  return f((min || max)!);
}

export function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}
