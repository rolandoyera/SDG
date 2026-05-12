// app/api/contact/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";

const Schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().optional(), // honeypot
  ts: z.number().optional(), // time trap; client sends a number
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 422 });
    }

    const { name, email, phone, company, ts } = parsed.data;

    // Honeypot: if filled, silently succeed
    if (company && company.trim() !== "") {
      return NextResponse.json({ ok: true });
    }

    if (!ts || Date.now() - ts < 1200) {
      return NextResponse.json({ ok: true });
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY!,
      },
      body: JSON.stringify({
        sender: { email: "hello@sarviandg.com", name: "Website Contact Form" }, // Update this if you have a different verified sender email in Brevo
        to: [{ email: "rolysemail@gmail.com" }, { email: "osh@sarviandg.com" }],
        replyTo: { email: "osh@sarviandg.com", name: "Oshrat Rothschild" },
        subject: "New Website Inquiry — Sarvian Design",
        textContent: `You've received a lead from SDG website\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone ?? ""}`,
        htmlContent: `
          <p style="font-family:Arial,sans-serif;font-size:16px;margin-bottom:20px;">
            <strong>You've received a lead from SDG website</strong>
          </p>
          <table cellpadding="6" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">
            <tr><td><strong>Name:</strong></td><td>${name}</td></tr>
            <tr><td><strong>Email:</strong></td><td>${email}</td></tr>
            <tr><td><strong>Phone:</strong></td><td>${phone ?? ""}</td></tr>
          </table>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Brevo API error:", errorData);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Contact email error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
