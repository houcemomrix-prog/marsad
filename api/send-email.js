import { Resend } from 'resend';
import { GoogleGenAI } from '@google/genai';

const resend = new Resend(process.env.RESEND_API_KEY);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userPrompt, recipientEmail } = req.body;

    // 1. Generate text/email response with Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt || 'Hello from Gemini',
    });

    const aiContent = response.text;

    // 2. Deliver via Resend
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: [recipientEmail],
      subject: 'Update from Marsad AI',
      html: `<p>${aiContent.replace(/\n/g, '<br>')}</p>`,
    });

    if (error) {
      return res.status(400).json({ error });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
