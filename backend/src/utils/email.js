import nodemailer from "nodemailer";

const enabled = () => Boolean(process.env.EMAIL_HOST_USER && process.env.EMAIL_HOST_PASSWORD);

export const sendEmail = async ({ to, subject, text }) => {
  if (!enabled()) {
    console.log(`[email disabled] ${subject} -> ${to}`);
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.EMAIL_PORT || 587),
    secure: String(process.env.EMAIL_USE_SSL).toLowerCase() === "true",
    auth: { user: process.env.EMAIL_HOST_USER, pass: process.env.EMAIL_HOST_PASSWORD },
    tls: { rejectUnauthorized: true },
  });
  await transporter.sendMail({
    from: process.env.DEFAULT_FROM_EMAIL || process.env.EMAIL_HOST_USER,
    to,
    subject,
    text,
  });
  return true;
};
