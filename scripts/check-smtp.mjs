/**
 * Verifies the SMTP credentials used to send Ally beta emails.
 *
 *   node --env-file=.env.local scripts/check-smtp.mjs
 *   node --env-file=.env.local scripts/check-smtp.mjs you@example.com
 *
 * With no argument it only connects and authenticates — nothing is sent.
 * Pass an address to also send one real test email to it.
 */
import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST?.trim() || "smtp.hostinger.com";
const port = Number(process.env.SMTP_PORT) || 465;
const user = process.env.SMTP_USER?.trim();
const pass = process.env.SMTP_PASSWORD;
const from = process.env.BETA_FROM_EMAIL?.trim();
const to = process.argv[2];

const fail = (msg) => {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
};

if (!user || !pass) fail("SMTP_USER / SMTP_PASSWORD are not set. Did you pass --env-file=.env.local?");

console.log(`host   ${host}:${port} (secure: ${port === 465})`);
console.log(`user   ${user}`);
console.log(`from   ${from || "(BETA_FROM_EMAIL not set)"}`);

// This script reads .env.local literally, but `next dev` runs it through
// dotenv-expand, which treats `$` as a variable reference and silently
// truncates the value. A password can therefore pass here and still fail with
// `535 authentication failed` in the app. `#` can start an inline comment.
for (const [char, why] of [["$", "dotenv-expand reads it as a variable reference"],
                           ["#", "dotenv may treat it as an inline comment"]]) {
  if (pass.includes(char)) {
    console.warn(
      `\nWARN  SMTP_PASSWORD contains '${char}' — ${why}.\n` +
      `      This check may pass while 'npm run dev' fails with 535.\n` +
      `      Choose a symbol such as - _ ! . * + = instead.`,
    );
  }
}

// Hostinger rejects a From address that isn't the authenticated mailbox, and
// the resulting error arrives at send time rather than login time. Catch it here.
if (from) {
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  if (address.toLowerCase() !== user.toLowerCase()) {
    fail(`BETA_FROM_EMAIL address (${address}) must match SMTP_USER (${user}).`);
  }
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
});

try {
  await transporter.verify();
  console.log("\nOK    connected and authenticated.");
} catch (error) {
  fail(`could not authenticate — ${error.message}`);
}

if (!to) {
  console.log("      No recipient given, so nothing was sent.");
  console.log("      To send a real test: node --env-file=.env.local scripts/check-smtp.mjs you@example.com");
  process.exit(0);
}

if (!from) fail("BETA_FROM_EMAIL must be set to send a test email.");

try {
  const info = await transporter.sendMail({
    from,
    to,
    subject: "Ally SMTP test",
    text: "If you are reading this, Ally early-access emails can send from this mailbox.",
  });
  console.log(`OK    test email accepted for delivery to ${to} (id ${info.messageId})`);
} catch (error) {
  fail(`send rejected — ${error.message}`);
}
