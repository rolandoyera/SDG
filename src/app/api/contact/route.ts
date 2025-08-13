// app/api/contact/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";

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

    const resend = new Resend(process.env.RESEND_API_KEY!);

    await resend.emails.send({
      from: "onboarding@resend.dev", // swap to your domain later
      to: ["rolysemail@gmail.com"],
      subject: "New Website Inquiry — Sarvian Design",
      replyTo: email,
      text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone ?? ""}`,
      html: `
        <table cellpadding="6" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">
          <tr><td><strong>Name:</strong></td><td>${name}</td></tr>
          <tr><td><strong>Email:</strong></td><td>${email}</td></tr>
          <tr><td><strong>Phone:</strong></td><td>${phone ?? ""}</td></tr>
        </table>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Contact email error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
