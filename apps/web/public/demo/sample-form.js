/* Practice resources deliberately use no network requests, storage or file uploads. */
(() => {
  "use strict";
  const text = (id, label, extra = {}) => ({ id, label, type: "text", ...extra });
  const select = (id, label, options) => ({ id, label, type: "select", options });
  const longText = (id, label, extra = {}) => text(id, label, { type: "textarea", ...extra });
  const name = () => text("name", "Fictional name", { placeholder: "Demo Student" });
  const roll = () => text("roll", "Demo roll number", { placeholder: "24M2901", pattern: "(?:24|26)M2[0-9]{3}", help: "Use a demo account, such as 24M2901." });
  const section = () => select("section", "Section", ["A", "B"]);
  const directoryFields = () => [name(), roll(), section(), select("wing", "Wing", ["A", "B"]), text("email", "Fictional contact email", { type: "email", placeholder: "student@example.invalid" })];
  const taskNext = "After simulating submission, return to Today and mark this task complete. This page does not update DeadlineOS.";
  const academicNext = "Return to Academics to view the calendar item. This practice resource does not record an academic submission.";
  const configs = {
    demo_wing_form: { title: "Demo placement preference form", description: "Share the roles and locations you would like the placement team to consider.", fields: [name(), roll(), select("function", "Preferred function", ["Consulting", "Finance", "Marketing", "Operations", "Business analytics"]), select("location", "Preferred work location", ["Mumbai", "Bengaluru", "Delhi NCR", "Open to relocation"]), select("experience", "Previous work experience", ["Fresher", "Under 12 months", "12–24 months", "More than 24 months"]), longText("skills", "Relevant skills", { placeholder: "e.g. Excel modelling, market research" })] },
    demo_overdue_form: { title: "Demo overdue library access form", description: "Request access to a research database for a specific coursework need.", fields: [name(), roll(), select("database", "Database requested", ["EBSCO Business Source", "CMIE Prowess", "Emerald Insight"]), longText("purpose", "Research purpose", { placeholder: "Describe the topic you are researching." }), select("duration", "Access duration", ["One week", "One month", "Current term"])] },
    demo_completed_form: { title: "Demo completed student directory form", description: "Review the contact and academic details used in the fictional batch directory.", fields: directoryFields() },
    demo_closed_form: { title: "Demo closed hostel confirmation", description: "Confirm accommodation details for the fictional campus stay.", status: "closed", fields: [name(), roll(), select("hostel", "Hostel block", ["Demo North Block", "Demo South Block"]), text("room", "Room number", { placeholder: "N-204" }), select("meal", "Meal preference", ["Vegetarian", "Non-vegetarian", "No meal plan"])] },
    demo_cancelled_form: { title: "Demo cancelled travel survey", description: "A travel survey for the cancelled fictional industry visit.", status: "cancelled", fields: [roll(), select("departure", "Departure point", ["Campus main gate", "City railway station"]), select("journey", "Journey required", ["Return journey", "Outbound only"]), longText("support", "Travel assistance needed (optional)", { required: false })] },
    demo_draft_form: { title: "Demo workshop interest draft", description: "Tell the organising team which skills workshop you would attend.", status: "draft", fields: [name(), roll(), select("topic", "Workshop topic", ["Case interview practice", "Financial modelling", "Data storytelling"]), select("level", "Current experience", ["Beginner", "Some experience", "Advanced"]), select("slot", "Preferred workshop slot", ["After class", "Saturday morning", "Sunday afternoon"])] },
    demo_directory_audit: { title: "Demo directory audit", description: "Check the fictional student directory and flag details that need correction.", fields: [roll(), section(), select("accuracy", "Are your directory details correct?", ["Yes, all details are correct", "No, a correction is needed"]), longText("correction", "Details to correct (optional)", { required: false, placeholder: "e.g. Wing should be B instead of A." })] },
    demo_reminder_check: { title: "Demo reminder check", description: "Check reminder readiness. Keep this task pending in DeadlineOS until the scheduled reminder is demonstrated.", next: "Return to Today and leave Demo reminder check pending. Delivery depends on maintenance, browser permission and device support.", fields: [roll(), select("permission", "Browser notification permission", ["Allowed", "Not yet requested", "Blocked"]), select("device", "Presentation device", ["Laptop browser", "Android phone", "Installed iPhone web app"]), select("inbox", "Can you open the DeadlineOS inbox?", ["Yes", "I need to check"])] },
    demo_section_b_form: { title: "Demo Section B transport form", description: "Choose a pickup route for the fictional Section B campus activity.", fields: [name(), roll(), select("pickup", "Pickup point", ["Campus Gate B", "Demo Central Station", "Demo City Centre"]), select("direction", "Transport required", ["Both directions", "To campus only", "From campus only"]), select("departure", "Preferred departure", ["08:00", "08:30", "09:00"])] },
    demo_preread_fin: { title: "Demo time value of money pre-read", view: "resource", description: "Financial Management · Reading notes for the upcoming class.", brief: ["Money available today can earn a return, so cash flows at different dates need a common valuation date.", "Present value = future value ÷ (1 + rate)^periods. At 10% for one year, a future ₹110 has a present value of ₹100.", "Before class: explain how the present value changes when the discount rate rises. Bring one example of a future cash flow."] },
    demo_preread_b: { title: "Demo Section B finance pre-read", view: "resource", description: "Financial Management · Section B reading notes.", brief: ["Working capital connects inventory, receivables and payables to a firm's day-to-day cash needs.", "A longer collection period can increase cash tied up in receivables, even when reported sales rise.", "Before class: identify two ways a fictional retailer could shorten its cash conversion cycle."] },
    demo_assignment_mkt: { title: "Demo brand positioning memo", description: "Marketing Management · Write a short practice response for a fictional brand.", back: "academics", next: academicNext, brief: ["Case: CampusCup sells reusable coffee cups to MBA students. Its competitors emphasise low prices.", "Your memo should identify a target segment, a clear point of difference and evidence supporting the promise."], fields: [text("brand", "Fictional brand", { placeholder: "CampusCup" }), longText("segment", "Target customer segment"), longText("positioning", "Positioning statement"), longText("evidence", "Reason to believe")] },
    demo_previous_class: { title: "Demo previous operations brief", description: "Operations Management · Practice analysing a small production process.", back: "academics", next: academicNext, brief: ["A fictional service desk takes 4 minutes to verify a request, 8 minutes to process it and 3 minutes to issue the result. Each stage has one operator.", "Identify the limiting stage and propose one practical improvement."], fields: [select("bottleneck", "Bottleneck stage", ["Verification", "Processing", "Issuing"]), text("capacity", "Bottleneck capacity (requests per hour)", { type: "number", min: "0", step: "0.1" }), longText("improvement", "Suggested process improvement")] },
    demo_quiz_ops: { title: "Demo process analysis quiz", description: "Operations Management · Three short practice questions; no grades are stored.", back: "academics", next: academicNext, fields: [select("bottleneck", "Which stage limits process throughput?", ["The stage with the lowest capacity", "The stage with the highest capacity", "The first stage in every process"]), text("capacity", "A station takes 5 minutes per unit. What is its hourly capacity?", { type: "number", min: "0", step: "1" }), select("utilisation", "Demand is 9 units/hour and capacity is 12. What is utilisation?", ["25%", "75%", "100%"])] },
    demo_quiz_b: { title: "Demo Section B operations quiz", description: "Operations Management · Section B inventory practice; no grades are stored.", back: "academics", next: academicNext, fields: [select("stock", "What does safety stock protect against?", ["Demand and lead-time uncertainty", "Every possible product defect", "All warehouse costs"]), text("reorder", "Daily demand is 20 units and lead time is 3 days. Reorder point without safety stock?", { type: "number", min: "0", step: "1" }), select("holding", "Which is an inventory holding cost?", ["Storage and capital tied up", "Sales revenue", "Customer payment"])] },
    demo_midterm_strategy: { title: "Demo strategy midterm", view: "resource", description: "Business Strategy · Examination brief.", brief: ["Coverage: industry structure, competitive advantage, value chains and corporate scope (Modules 1–4).", "Format: a fictional case analysis followed by short conceptual questions. Closed book.", "Venue: Demo classroom 101. Use the date and time shown in your DeadlineOS calendar. This page does not host an exam."] },
    demo_endterm_fin: { title: "Demo finance endterm", view: "resource", description: "Financial Management · Examination brief.", brief: ["Coverage: time value of money, capital budgeting, cost of capital and working capital.", "Bring a calculator. Prepare to show assumptions and working for numerical problems.", "Venue: Demo classroom 101. Use the date and time shown in your DeadlineOS calendar. This page does not host an exam."] },
    demo_cancelled_exam: { title: "Demo cancelled strategy quiz", view: "resource", status: "cancelled", description: "Business Strategy · Cancelled calendar item.", brief: ["This fictional assessment is cancelled. No response or submission is needed.", "Return to Academics to demonstrate how cancelled dates remain visible without becoming active obligations."] },
  };
  const competitions = [
    ["demo_case_open", "Demo Product Innovation Sprint", "Proposed product", "Describe a product that solves a specific student problem.", "Product design"],
    ["demo_case_partial", "Demo Social Impact Challenge", "Social problem and proposed intervention", "Explain who benefits and how you would measure the impact.", "Social impact"],
    ["demo_case_registered", "Demo National Strategy Challenge", "Strategic recommendation", "Recommend a growth strategy for a fictional company.", "Business strategy"],
    ["demo_case_draft", "Demo Market Entry Challenge draft", "Target market and entry approach", "Choose a fictional market and explain the first entry step.", "Market entry"],
  ];
  for (const [id, title, question, hint, track] of competitions) {
    const status = id === "demo_case_draft" ? "draft" : "published";
    configs[`${id}_external`] = { title: `${title} external registration`, status, back: "opportunities", description: "Organiser registration · Individual participation in the fictional competition.", next: "Return to Opportunities and choose Confirm external. Complete the separate internal form as well.", fields: [name(), roll(), text("institute", "Institution", { placeholder: "Demo School of Management" }), longText("proposal", question, { placeholder: hint }), select("track", "Participation track", [track, "Open category"])] };
    configs[`${id}_internal`] = { title: `${title} internal confirmation`, status, back: "opportunities", description: "Batch coordination · Record the organiser registration details for your POC.", next: "Return to Opportunities and choose Confirm internal. Both confirmations are needed for completion.", fields: [roll(), section(), text("reference", "Fictional organiser registration reference", { placeholder: "DEMO-REG-1042" }), select("registered", "Organiser registration status", ["Registration completed", "Awaiting organiser acknowledgement"]), longText("support", "Support needed from the batch POC (optional)", { required: false })] };
  }
  const internships = [
    ["demo_internship", "DemoCorp", "Strategy Intern", "Why are you interested in this strategy role?", "Client research and market sizing"],
    ["demo_internship_analytics", "Sample Analytics", "Business Analyst Intern", "Describe a fictional data analysis project", "SQL, spreadsheets and data visualisation"],
    ["demo_internship_draft", "Practice Labs", "Strategy Intern", "What would you like to learn during this internship?", "Research and presentation skills"],
    ["demo_internship_cancelled", "Fictional Ventures", "Strategy Intern", "Describe your interest in the role", "Research and problem solving"],
  ];
  for (const [id, company, role, question, hint] of internships) {
    configs[id] = { title: `${company} ${role}`, status: id.endsWith("cancelled") ? "cancelled" : id.endsWith("draft") ? "draft" : "published", back: "internships", description: `${company} · ${role}. Practice the application using fictional experience.`, next: "Return to Internships and mark yourself registered. This practice application is not sent to an employer.", fields: [name(), roll(), select("availability", "Availability", ["Eight weeks", "Ten weeks", "Twelve weeks"]), longText("skills", "Relevant skills", { placeholder: hint }), longText("motivation", question), text("portfolio", "Fictional portfolio URL (optional)", { type: "url", required: false, placeholder: "https://example.invalid/portfolio" })] };
  }

  // Legacy fixtures contained only a title. Resolve their original titles as well
  // so existing presentations do not require a destructive data refresh.
  const legacyTitles = new Map(Object.entries(configs).map(([id, config]) => [config.title.toLowerCase(), id]));
  for (const [id, company] of internships) legacyTitles.set(`${company} internship`.toLowerCase(), id);
  const params = new URLSearchParams(location.search);
  const requestedTitle = params.get("title")?.trim() || "";
  const kind = params.get("kind") || legacyTitles.get(requestedTitle.toLowerCase());
  const config = Object.hasOwn(configs, kind || "") ? configs[kind] : null;
  const el = (id) => document.getElementById(id);
  const add = (parent, tag, value) => { const node = document.createElement(tag); node.textContent = value; parent.append(node); return node; };
  if (!config) {
    el("title").textContent = "Demo resource unavailable";
    el("description").textContent = "Open a sample item from DeadlineOS to load its relevant resource. If this is an older custom link, prepare the demo workspace to refresh its links.";
    document.title = "Demo resource unavailable · DeadlineOS";
    return;
  }
  el("title").textContent = requestedTitle || config.title;
  document.title = `${el("title").textContent} · DeadlineOS`;
  el("description").textContent = config.description;
  el("back").href = `/?view=${config.back || (config.view === "resource" ? "academics" : "today")}`;
  const status = ["published", "draft", "closed", "cancelled"].includes(params.get("status")) ? params.get("status") : config.status;
  const blocked = status === "closed" || status === "cancelled";
  if (blocked || status === "draft") {
    el("availability").hidden = false;
    el("availability").textContent = blocked ? `This sample is ${status}. Submissions are unavailable.` : "Draft preview · This sample has not been published.";
  }
  if (config.brief) {
    el("brief").hidden = false;
    add(el("brief"), "h2", config.view === "resource" ? "Reading and preparation" : "Practice brief");
    config.brief.forEach(paragraph => add(el("brief"), "p", paragraph));
  }
  if (config.view === "resource") return;
  const form = el("demo-form");
  form.hidden = false;
  const next = config.next || taskNext;
  el("next-step").textContent = next;
  for (const field of config.fields) {
    const wrapper = document.createElement("div"); wrapper.className = "field";
    const inputId = `field-${field.id}`;
    const label = add(wrapper, "label", field.label); label.htmlFor = inputId;
    const input = document.createElement(field.type === "select" ? "select" : field.type === "textarea" ? "textarea" : "input");
    input.id = inputId; input.name = field.id; input.required = field.required !== false;
    if (input.tagName === "INPUT") input.type = field.type;
    if (field.type === "select") {
      const placeholder = add(input, "option", "Choose an option"); placeholder.value = ""; placeholder.disabled = true; placeholder.selected = true;
      field.options.forEach(option => { const node = add(input, "option", option); node.value = option; });
    }
    for (const key of ["placeholder", "pattern", "min", "step"]) if (field[key] !== undefined) input.setAttribute(key, field[key]);
    if (field.type === "text" || field.type === "textarea") input.maxLength = field.type === "textarea" ? 2000 : 160;
    wrapper.append(input);
    if (field.help) { const help = add(wrapper, "p", field.help); help.id = `${field.id}-help`; help.className = "field-help"; input.setAttribute("aria-describedby", help.id); }
    el("fields").append(wrapper);
  }
  el("fields").disabled = blocked;
  el("acknowledgement").disabled = blocked;
  el("submit").disabled = blocked;
  if (blocked) el("submit").textContent = status === "closed" ? "Form closed" : "Form cancelled";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (blocked || !form.reportValidity()) return;
    const result = el("result"); result.replaceChildren(); result.hidden = false;
    add(result, "h2", "Demo submission simulated");
    add(result, "p", "No information was sent or saved. This preview disappears when you leave or reload the page.");
    const summary = add(result, "dl", "");
    config.fields.forEach(field => { const value = el(`field-${field.id}`).value.trim(); if (value) { add(summary, "dt", field.label); add(summary, "dd", value); } });
    add(result, "p", next);
    result.focus();
  });
})();
