export async function parseResumeText(text: string) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { configured: false as const };
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "openrouter/auto",
      messages: [
        { role: "system", content: "Extract skills as a JSON array. Do not invent employers." },
        { role: "user", content: text.slice(0, 8000) },
      ],
    }),
  });
  if (!response.ok) return { configured: true as const, error: "provider_rejected" };
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return { configured: true as const, content: body.choices?.[0]?.message?.content ?? "" };
}

export function createCheckout(provider: "razorpay" | "stripe", tenantId: string) {
  return { provider, tenantId, charged: false, status: "hook_only" as const };
}
