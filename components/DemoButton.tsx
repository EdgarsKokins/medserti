/** One-click demo sign-in. A plain form, so it works before any JavaScript has loaded. */
export default function DemoButton({ label, className = "btn" }: { label: string; className?: string }) {
  return (
    <form action="/api/auth/demo" method="post" className="demo-form">
      <button type="submit" className={className}>{label}</button>
    </form>
  );
}
