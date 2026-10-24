export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <article className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">
            Last updated: October 24, 2026
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
            In the default private-key mode, the encryption key is not stored on the server. If you lose the
            session code or encryption key, the service cannot recover your
            messages or files.
          </p>
          <p className="text-muted-foreground">
            In optional code-only sessions, the encryption key is derived from
            the session code. Anyone with that code, including the server, can
            derive the key and read messages and files.
          </p>
          <p className="text-muted-foreground">
            A random device identifier and your chosen device name are saved in
            this browser to distinguish senders. They are included inside the
            encrypted message content, not stored as separate server metadata.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Retention</h2>
          <p className="text-muted-foreground">
            Sessions, messages, and uploaded files are intended to expire 2
            hours after a session is created. Sending a message resets the
            session and attachment expiration time to 2 hours from that
            message. Expired uploads are removed during cleanup when the service
            handles related API requests. Orphaned encrypted upload files may
            also be removed after they become old enough.
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
