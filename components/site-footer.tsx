import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t bg-background px-4 py-4">
      <nav className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <Link className="hover:text-foreground" href="/privacy">
          Privacy Policy
        </Link>
        <span aria-hidden="true">·</span>
        <Link className="hover:text-foreground" href="/terms">
          Terms of Service
        </Link>
        <span aria-hidden="true">·</span>
        <a
          className="hover:text-foreground"
          href="https://github.com/wafla"
          rel="noreferrer"
          target="_blank"
        >
          Contact
        </a>
      </nav>
    </footer>
  );
}
