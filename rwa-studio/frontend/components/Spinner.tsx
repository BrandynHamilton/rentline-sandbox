export default function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="rounded-full border-2 border-[var(--color-border)] border-t-emerald-400 animate-spin inline-block"
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner size={32} />
    </div>
  );
}
