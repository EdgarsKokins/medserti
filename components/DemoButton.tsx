/**
 * One-click demo sign-in. A plain link (no prefetch), so it works before any JavaScript has loaded
 * and crawlers and screen readers see it as a link.
 */
export default function DemoButton({ label, className = "btn" }: { label: string; className?: string }) {
  return (
    <a href="/api/auth/demo" className={className} rel="nofollow">
      {label}
    </a>
  );
}
