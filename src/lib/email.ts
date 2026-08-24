/**
 * Envio de correo via la API REST de Resend, sin el SDK — es la misma cuenta
 * que ya usa el proveedor de acceso por correo (AUTH_RESEND_KEY), asi que no
 * hace falta una clave nueva ni una dependencia nueva.
 */

export const emailAvailable = !!process.env.AUTH_RESEND_KEY;

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!emailAvailable) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AUTH_RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM || "no-reply@resend.dev",
      to,
      subject,
      html,
    }),
  });
  return res.ok;
}
