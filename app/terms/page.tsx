export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <article className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">
            Last updated: July 10, 2026
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Temporary Sharing Service</h2>
          <p className="text-muted-foreground">
            CtrlCV is a temporary text and file sharing service. It is designed
            for short-lived transfer between devices and does not guarantee
            long-term storage, backup, availability, or recovery.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Your Responsibilities</h2>
          <p className="text-muted-foreground">
            You are responsible for the messages and files you share. Do not
            upload or share illegal content, malware, content that violates
            another person&apos;s rights, or content you do not have permission
            to share.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Sensitive Information</h2>
          <p className="text-muted-foreground">
            Avoid sharing passwords, identification documents, financial
            information, private images, or other sensitive information. Even
            with browser-side encryption, no online service can remove all risk.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Encryption Key</h2>
          <p className="text-muted-foreground">
            The encryption key is required to decrypt shared messages and files.
            CtrlCV does not store this key on the server and cannot recover it
            for you.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Abuse and Availability</h2>
          <p className="text-muted-foreground">
            Access may be limited, blocked, or removed to protect the service,
            users, or others. The service may change, pause, or stop at any
            time.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">No Legal Advice</h2>
          <p className="text-muted-foreground">
            These terms are a practical notice for this project and are not a
            substitute for legal advice.
          </p>
        </section>
      </article>
    </main>
  );
}
