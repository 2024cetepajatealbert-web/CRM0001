const PublicError = require("../utils/publicError");

const model = "gemini-3.1-flash-lite";
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// The entire model input comes from this fictional catalog, including the speaker labels.
const samples = [
  {
    id: "condo-viewing",
    title: "A first condo viewing",
    preparedBrief: {
      summary:
        "The buyer wants to see the floor plan before deciding on a viewing. They still need to check their availability.",
      facts: ["Two-bedroom condo in Iloilo City", "Budget up to ₱4 million"],
      followUp:
        "I’d send the floor plan and ask whether Saturday morning works before booking a visit.",
      timingQuote: "Saturday morning might work for a viewing, but I need to check.",
    },
    messages: [
      {
        speaker: "Buyer",
        text: "We're looking for a two-bedroom condo in Iloilo City, up to ₱4 million.",
      },
      {
        speaker: "Agent",
        text: "I have a unit near the business park. Would you like the floor plan or a viewing?",
      },
      {
        speaker: "Buyer",
        text: "Please send the floor plan first. Saturday morning might work for a viewing, but I need to check.",
      },
    ],
  },
  {
    id: "townhouse-financing",
    title: "Financing a townhouse",
    preparedBrief: {
      summary:
        "The buyer wants to understand the upfront and monthly costs before choosing a townhouse. They haven’t settled on a budget.",
      facts: ["Townhouse in General Santos", "A parking space is essential"],
      followUp:
        "I’d put the down payment and monthly payments side by side so the buyer can compare their options.",
      timingQuote: "",
    },
    messages: [
      {
        speaker: "Buyer",
        text: "I'm comparing townhouses in General Santos. I need a parking space.",
      },
      {
        speaker: "Agent",
        text: "Would a sample breakdown of the down payment and monthly payments help?",
      },
      {
        speaker: "Buyer",
        text: "Yes, please send both before I choose a property. I haven't decided on a budget yet.",
      },
    ],
  },
];

const schema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    facts: { type: "array", items: { type: "string" }, maxItems: 4 },
    followUp: { type: "string" },
    timingQuote: { type: "string" },
  },
  required: ["summary", "facts", "followUp", "timingQuote"],
};
const instructions = [
  "You are Mr.C, CRAM’s professional Inbox assistant. Speak to the agent as a colleague in clear, conversational English.",
  "Lead with what matters to the buyer in one or two sentences. List up to four short facts explicitly stated by the buyer.",
  "Suggest one practical next step in the first person, such as 'I’d send the floor plan.' Leave sending messages and scheduling to the agent.",
  "Keep tentative arrangements tentative. Never invent a price, requirement, date or booking.",
  "If a buyer mentions when to act, copy the exact timing phrase into timingQuote. Otherwise use an empty string.",
].join(" ");

function configured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function readBrief(payload, sample) {
  const candidate = payload?.candidates?.[0];
  const parts = candidate?.content?.parts;
  const text =
    Array.isArray(parts) &&
    parts
      .filter((part) => part && !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
  const invalid = new PublicError("Gemini could not finish a usable summary. Please try again.");
  if (candidate?.finishReason !== "STOP" || !text) throw invalid;
  let brief;
  try {
    brief = JSON.parse(text);
  } catch {
    throw invalid;
  }
  const shortText = (value, max) =>
    typeof value === "string" && value.trim().length > 0 && value.length <= max;
  if (
    !shortText(brief?.summary, 800) ||
    !Array.isArray(brief.facts) ||
    brief.facts.length > 4 ||
    !brief.facts.every((fact) => shortText(fact, 300)) ||
    !shortText(brief.followUp, 500) ||
    typeof brief.timingQuote !== "string"
  )
    throw invalid;
  const quote = brief.timingQuote.trim();
  return {
    summary: brief.summary.trim(),
    facts: brief.facts.map((fact) => fact.trim()),
    followUp: brief.followUp.trim(),
    timingQuote:
      quote &&
      quote.length <= 200 &&
      sample.messages.some((m) => m.speaker === "Buyer" && m.text.includes(quote))
        ? quote
        : "",
  };
}

async function requestBrief(sample) {
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY.trim(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(sample.messages) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          maxOutputTokens: 1200,
        },
      }),
    });
  } catch {
    throw new PublicError(
      "Gemini could not be reached. Check the server's internet connection and try again.",
      503,
    );
  }
  if (response.status === 429)
    throw new PublicError(
      "Gemini's quota is busy or exhausted. Check the project limits in AI Studio and try again later.",
      429,
    );
  if ([400, 401, 403, 404].includes(response.status))
    throw new PublicError(
      "Gemini rejected the request. Ask the administrator to check the API key and model access.",
    );
  if (!response.ok)
    throw new PublicError("Gemini is temporarily unavailable. Please try again later.", 503);
  const payload = await response.json().catch(() => null);
  return readBrief(payload, sample);
}

// A successful brief belongs to a fixed sample and can be reused across demo sessions.
const summaries = new Map();
async function summarize(id) {
  const sample = samples.find((item) => item.id === id);
  if (!sample) throw new PublicError("Choose a listed demo conversation.", 404);
  if (!configured())
    throw new PublicError("Gemini needs an API key in the CRAM server settings.", 503);
  if (!summaries.has(id)) {
    summaries.set(
      id,
      requestBrief(sample).catch((error) => {
        summaries.delete(id);
        throw error;
      }),
    );
  }
  return summaries.get(id);
}

module.exports = { samples, configured, summarize };
