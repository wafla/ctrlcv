export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <article className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">
            Last updated: July 10, 2026
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">What CtrlCV Does</h2>
          <p className="text-muted-foreground">
            CtrlCV lets users share text and files between devices without
            creating an account. Sessions are temporary.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Messages and Files</h2>
          <p className="text-muted-foreground">
            Messages and files are encrypted in your browser before upload. The
            server stores encrypted message content, encrypted file blobs, and
            minimal metadata such as session id, file id, file size, MIME type,
            creation time, and expiration time.
          </p>
          <p className="text-muted-foreground">
            The encryption key is not stored on the server. If you lose the
            session code or encryption key, the service cannot recover your
            messages or files.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Retention</h2>
          <p className="text-muted-foreground">
            Sessions, messages, and uploaded files are intended to expire after
            about 2 hours. Expired uploads are removed during cleanup when the
            service handles related API requests. Orphaned encrypted upload
            files may also be removed after they become old enough.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Usage Statistics</h2>
          <p className="text-muted-foreground">
            CtrlCV may store anonymous usage events and daily aggregate counts,
            such as sessions created, messages sent, files uploaded, uploaded
            byte totals, and API errors. Message content, file contents, raw
            session codes, IP addresses, and user-agent strings are not stored
            for analytics.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Security Notes</h2>
          <p className="text-muted-foreground">
            Do not upload sensitive, illegal, or private information unless you
            understand the risks. Use the QR link or share both the session code
            and encryption key only with people you trust.
          </p>
        </section>
      </article>
    </main>
  );
}
