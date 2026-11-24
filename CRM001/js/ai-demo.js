(() => {
  const dialog = document.getElementById("ai-demo-dialog");
  const select = document.getElementById("ai-demo-select");
  const choices = document.getElementById("ai-demo-samples");
  const transcript = document.getElementById("ai-demo-transcript");
  const result = document.getElementById("ai-demo-result");
  const status = document.getElementById("ai-demo-status");
  const retry = document.getElementById("ai-demo-retry");
  let api,
    samples = [],
    configured = false,
    revision = 0;

  const current = (request) => dialog.open && request === revision;
  function showStatus(message, canRetry = false) {
    status.classList.toggle("sr-only", !result.hidden && !canRetry);
    status.textContent = message;
    retry.hidden = !canRetry;
  }

  function renderBrief(brief, source) {
    document.getElementById("ai-demo-source").textContent = source;
    document.getElementById("ai-demo-summary").textContent = brief.summary;
    const facts = document.getElementById("ai-demo-facts");
    facts.hidden = !brief.facts.length;
    facts.querySelector("ul").replaceChildren(
      ...brief.facts.map((fact) => {
        const item = document.createElement("li");
        item.textContent = fact;
        return item;
      }),
    );
    document.getElementById("ai-demo-action").textContent = brief.followUp;
    const timing = document.getElementById("ai-demo-timing");
    timing.hidden = !brief.timingQuote;
    timing.textContent = brief.timingQuote ? `In the buyer’s words, “${brief.timingQuote}”` : "";
    result.hidden = false;
  }

  function showPrepared(sample, retryLive = false) {
    if (!sample.preparedBrief) {
      transcript.open = true;
      showStatus("You can read the sample chat while the brief is unavailable.", true);
      return;
    }
    renderBrief(sample.preparedBrief, "Prepared example");
    showStatus(
      retryLive
        ? "I couldn’t refresh the brief. Here’s the prepared version for this conversation."
        : "Your example brief is ready.",
      retryLive,
    );
  }

  async function showSample() {
    const request = ++revision;
    const sample = samples.find((item) => item.id === select.value);
    result.hidden = true;
    if (!sample) {
      transcript.hidden = true;
      showStatus("I couldn’t find a sample conversation to review.", true);
      return;
    }
    const lines = sample.messages.map(({ speaker, text }) => {
      const line = document.createElement("li");
      const label = document.createElement("strong");
      label.textContent = speaker;
      line.append(label, document.createTextNode(text));
      return line;
    });
    transcript.querySelector("ol").replaceChildren(...lines);
    transcript.hidden = false;
    if (!configured) return showPrepared(sample);
    showStatus("I’m reviewing the buyer’s messages…");
    try {
      const brief = await api(`/ai-demo/${encodeURIComponent(sample.id)}/summary`, "POST");
      if (!current(request)) return;
      renderBrief(brief, "AI-generated brief");
      showStatus("Your conversation brief is ready.");
    } catch {
      if (current(request)) showPrepared(sample, true);
    }
  }

  async function loadSamples() {
    const request = ++revision;
    const previous = select.value;
    choices.hidden = true;
    result.hidden = true;
    transcript.hidden = true;
    showStatus("Opening the sample conversations…");
    try {
      const catalog = await api("/ai-demo");
      if (!current(request)) return;
      samples = catalog.samples;
      configured = catalog.configured;
      select.replaceChildren(...samples.map(({ id, title }) => new Option(title, id)));
      if (samples.some((item) => item.id === previous)) select.value = previous;
      choices.hidden = false;
      await showSample();
    } catch {
      if (current(request))
        showStatus("I couldn’t open the sample conversations. Please try again.", true);
    }
  }

  select.addEventListener("change", showSample);
  retry.addEventListener("click", loadSamples);
  document.addEventListener("cram:logout", () => {
    if (dialog.open) dialog.close();
    ++revision;
    api = null;
    samples = [];
    select.replaceChildren();
  });

  window.cramAiDemo = {
    open(request) {
      if (dialog.open) return;
      api = request;
      transcript.open = false;
      dialog.showModal();
      dialog.querySelector(".ai-demo-body").scrollTop = 0;
      loadSamples();
    },
  };
})();
