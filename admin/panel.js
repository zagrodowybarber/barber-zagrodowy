(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORE_KEY = "barber-admin-local-v1";
  const today = startOfDay(new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthLimit = new Date(today.getFullYear(), today.getMonth() + 12, 1);
  const monthNames = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
  const weekdayNames = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Ndz"];
  const weekdayLong = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];

  function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
  function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  function fromKey(value) { const [y, m, d] = value.split("-").map(Number); return new Date(y, m - 1, d); }
  function addDays(date, count) { const result = new Date(date); result.setDate(result.getDate() + count); return result; }
  function mondayOf(date) { const result = startOfDay(date); result.setDate(result.getDate() - (result.getDay() + 6) % 7); return result; }
  function monthIndex(date) { return date.getFullYear() * 12 + date.getMonth(); }
  function formatDate(date, options = {}) { return new Intl.DateTimeFormat("pl-PL", options).format(date); }
  function minutesOf(value) { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
  function timeString(minutes) { return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }
  function durationOf(event) { return Math.max(0, minutesOf(event.end) - minutesOf(event.start)); }
  function safeDate(value) { return value ? fromKey(value) : today; }
  function makeId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }

  function sampleData() {
    const day1 = dateKey(today), day2 = dateKey(addDays(today, 1)), day4 = dateKey(addDays(today, 3)), day6 = dateKey(addDays(today, 5));
    const events = [
      { id: "demo-a", type: "visit", status: "confirmed", date: day1, start: "10:30", end: "11:10", name: "Jan Testowy", service: "Strzyżenie włosów", createdAt: Date.now() - 12 * 60000 },
      { id: "demo-b", type: "visit", status: "confirmed", date: day1, start: "12:00", end: "12:30", name: "Michał Testowy", service: "Strzyżenie brody", createdAt: Date.now() - 44 * 60000 },
      { id: "demo-c", type: "visit", status: "pending", date: day2, start: "14:00", end: "15:00", name: "Adam Testowy", service: "Strzyżenie combo", createdAt: Date.now() - 2 * 3600000 },
      { id: "demo-d", type: "visit", status: "confirmed", date: day4, start: "11:00", end: "11:30", name: "Kamil Testowy", service: "Depilacja nosa woskiem", createdAt: Date.now() - 5 * 3600000 },
      { id: "demo-e", type: "visit", status: "cancelled", date: day6, start: "13:00", end: "14:00", name: "Paweł Testowy", service: "Strzyżenie włosów", createdAt: Date.now() - 26 * 3600000 },
      { id: "demo-f", type: "other", status: "confirmed", date: day4, start: "16:00", end: "17:00", name: "Przerwa", service: "" }
    ];
    return {
      events,
      activity: [
        { id: "activity-e", eventId: "demo-e", type: "cancelled", createdAt: Date.now() - 26 * 3600000 },
        { id: "activity-c", eventId: "demo-c", type: "new", createdAt: Date.now() - 2 * 3600000 },
        { id: "activity-b", eventId: "demo-b", type: "new", createdAt: Date.now() - 44 * 60000 },
        { id: "activity-a", eventId: "demo-a", type: "new", createdAt: Date.now() - 12 * 60000 }
      ],
      services: [
        { name: "Strzyżenie włosów", price: 70, duration: 40, active: true },
        { name: "Strzyżenie brody", price: 50, duration: 25, active: true },
        { name: "Strzyżenie combo", price: 120, duration: 60, active: true },
        { name: "Regulacja brwi", price: 10, duration: 5, active: true },
        { name: "Golenie", price: 40, duration: 10, active: true },
        { name: "Mycie głowy", price: 10, duration: 0, active: true },
        { name: "Depilacja nosa woskiem", price: 10, duration: 5, active: true }
      ],
      hours: weekdayLong.map((name, index) => ({ name, open: index < 6, start: "10:00", end: index === 5 ? "16:30" : "19:00" })),
      daysOff: [],
      content: { heading: "Barber Zagrodowy", description: "Umów wizytę w salonie." },
      gallery: ["../assets/salon-1.jfif", "../assets/salon-2.jfif", "../assets/salon-3.jfif", "../assets/salon-4.jfif"]
    };
  }

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && Array.isArray(saved.events) && Array.isArray(saved.services)) return { ...sampleData(), ...saved };
    } catch { /* start with a fresh local preview */ }
    return sampleData();
  }

  let state = readState();
  let selectedDate = today;
  let hasSelectedCalendarDate = false;
  let visibleMonth = monthStart;
  let selectedEventId = null;
  let toastTimer = 0;
  let wheels = new Map();

  function saveState(message) {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    renderAll();
    if (message) showToast(message);
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
  }

  function setPage(page) {
    $$(".page").forEach((element) => element.classList.toggle("active", element.id === `page-${page}`));
    $$(".nav-link").forEach((element) => element.classList.toggle("active", element.dataset.page === page));
    const selected = $(`#page-${page}`);
    const title = selected?.dataset.title || "Pulpit";
    $("#page-title").textContent = title;
    $("#crumb-current").textContent = title.toLocaleUpperCase("pl-PL");
    if (page === "calendar") renderCalendar();
    if (page === "today") renderTodayPage();
    if (page === "services") renderServices();
    if (page === "hours") renderHours();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function currentEvents(date, includeCancelled = true) {
    const key = typeof date === "string" ? date : dateKey(date);
    return state.events.filter((event) => event.date === key && (includeCancelled || event.status !== "cancelled"))
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  function isClosed(date) {
    return date.getDay() === 0 || state.daysOff.some((item) => item.date === dateKey(date));
  }

  function isOnlineBookable(date) {
    const maxDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    return date >= today && date <= maxDate && !isClosed(date);
  }

  function preferredDateForMonth(month) {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const appointment = state.events
      .filter((event) => event.status !== "cancelled" && fromKey(event.date) >= first && fromKey(event.date) <= end)
      .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))[0];
    if (appointment) return fromKey(appointment.date);
    const cursor = first < today ? today : first;
    for (let day = cursor.getDate(); day <= end.getDate(); day += 1) {
      const candidate = new Date(month.getFullYear(), month.getMonth(), day);
      if (!isClosed(candidate)) return candidate;
    }
    return first;
  }

  function renderTodayPage() {
    const host = $("#today-lessons");
    host.replaceChildren();
    const dateLabel = formatDate(today, { weekday: "long", day: "numeric", month: "long" });
    $("#today-heading").textContent = dateLabel;
    $("#today-label").textContent = dateLabel;
    const rows = currentEvents(today);
    if (!rows.length) {
      host.innerHTML = '<div class="today-empty"><strong>Brak wizyt na dziś</strong><small>Nowe rezerwacje pojawią się tutaj.</small></div>';
      return;
    }
    rows.forEach((event) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `today-lesson${event.status === "cancelled" ? " cancelled" : ""}${event.type === "other" ? " other" : ""}`;
      row.innerHTML = `<span class="today-lesson-time"><strong>${escapeHtml(event.start)}</strong><small>do ${escapeHtml(event.end)}</small></span><span class="today-lesson-main"><strong>${escapeHtml(event.name)}</strong><small>${escapeHtml(event.service || "Wydarzenie własne")}</small></span><span class="today-lesson-status ${event.status === "cancelled" ? "cancelled" : event.status === "pending" ? "pending" : ""}">${event.status === "cancelled" ? "Anulowana" : event.status === "pending" ? "Do potwierdzenia" : event.type === "other" ? "Wydarzenie" : "Wizyta"}</span>`;
      row.addEventListener("click", () => openEventFromActivity(event.id));
      host.append(row);
    });
  }

  function activityCopy(item, event) {
    const name = event?.name || "Usunięte wydarzenie";
    if (item.type === "new") return { icon: "+", title: "Nowa rezerwacja", description: `${name} · ${event?.service || "wizyta"} · ${event?.start || "—"} · ${event ? durationOf(event) : 0} min` };
    if (item.type === "cancelled") return { icon: "×", title: "Anulowana rezerwacja", description: `${name} · ${event?.service || "wizyta"} · ${event?.start || "—"} · ${event ? durationOf(event) : 0} min` };
    if (item.type === "rescheduled") return { icon: "↻", title: "Zmiana terminu", description: `${name} · ${item.oldDate ? formatDate(fromKey(item.oldDate), { day: "numeric", month: "short" }) + " → " : ""}${event ? formatDate(fromKey(event.date), { day: "numeric", month: "short" }) : "—"} · ${event?.start || "—"} · ${event ? durationOf(event) : 0} min` };
    return { icon: "•", title: "Dodane wydarzenie", description: `${name} · ${event?.start || "—"}` };
  }

  function renderActivity() {
    const host = $("#activity-list");
    host.replaceChildren();
    const items = [...state.activity].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
    if (!items.length) { host.innerHTML = '<div class="empty-state">Nie ma jeszcze żadnych aktualizacji.</div>'; return; }
    items.forEach((item) => {
      const event = state.events.find((entry) => entry.id === item.eventId);
      const copy = activityCopy(item, event);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "activity-item";
      button.dataset.eventId = item.eventId;
      button.innerHTML = `<span class="activity-icon ${item.type}">${copy.icon}</span><span><strong class="activity-title">${escapeHtml(copy.title)}</strong><small class="activity-description">${escapeHtml(copy.description)} · ${event ? formatDate(fromKey(event.date), { day: "numeric", month: "short" }) : ""}</small></span><time class="activity-meta">${timeAgo(item.createdAt)}</time>`;
      button.addEventListener("click", () => openEventFromActivity(item.eventId));
      host.append(button);
    });
  }

  function timeAgo(timestamp) {
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (minutes < 1) return "teraz";
    if (minutes < 60) return `${minutes} min temu`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} godz. temu`;
    return `${Math.floor(hours / 24)} dni temu`;
  }

  function renderMonth() {
    const grid = $("#month-grid");
    grid.replaceChildren();
    $("#month-label").textContent = `${monthNames[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`;
    $("#month-back-label").textContent = `${monthNames[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`;
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const count = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    for (let i = 0; i < offset; i += 1) { const blank = document.createElement("span"); blank.className = "day-cell outside"; grid.append(blank); }
    for (let day = 1; day <= count; day += 1) {
      const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
      const key = dateKey(date);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `day-cell ${isOnlineBookable(date) ? "available" : "closed"}${hasSelectedCalendarDate && key === dateKey(selectedDate) ? " selected" : ""}${key === dateKey(today) ? " today" : ""}`;
      button.textContent = String(day);
      button.dataset.date = key;
      button.setAttribute("aria-label", `${formatDate(date, { weekday: "long", day: "numeric", month: "long" })}${isOnlineBookable(date) ? ", rezerwacje otwarte" : ", rezerwacje online niedostępne"}`);
      button.addEventListener("click", () => selectDate(date));
      grid.append(button);
    }
    const current = monthIndex(visibleMonth), firstIndex = monthIndex(monthStart), lastIndex = monthIndex(monthLimit) - 1;
    $("#month-prev").disabled = current <= firstIndex;
    $("#month-next").disabled = current >= lastIndex;
  }

  function renderWeek() {
    const strip = $("#week-strip");
    strip.replaceChildren();
    const monday = mondayOf(selectedDate);
    for (let i = 0; i < 7; i += 1) {
      const date = addDays(monday, i), key = dateKey(date);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `week-day${key === dateKey(selectedDate) ? " selected" : ""}${currentEvents(date, false).length ? " has-events" : ""}`;
      button.innerHTML = `<span>${weekdayNames[i]}</span><strong>${date.getDate()}</strong>`;
      button.setAttribute("aria-label", formatDate(date, { weekday: "long", day: "numeric", month: "long" }));
      button.addEventListener("click", () => selectDate(date));
      strip.append(button);
    }
    $("#selected-date-label").textContent = formatDate(selectedDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  function renderDayEvents() {
    const host = $("#day-events");
    host.replaceChildren();
    const rows = currentEvents(selectedDate);
    $("#agenda-count").textContent = `${rows.length} ${rows.length === 1 ? "wydarzenie" : rows.length > 1 && rows.length < 5 ? "wydarzenia" : "wydarzeń"}`;
    if (!rows.length) { host.innerHTML = '<div class="no-events">Brak wydarzeń w tym dniu.<br>Dodaj wizytę lub inne wydarzenie.</div>'; return; }
    rows.forEach((event) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `event-card${event.status === "cancelled" ? " cancelled" : ""}`;
      button.innerHTML = `<span class="event-time"><strong>${escapeHtml(event.start)}</strong><small>do ${escapeHtml(event.end)}</small></span><span class="event-copy"><strong>${escapeHtml(event.name)}</strong><small>${escapeHtml(event.service || "Wydarzenie własne")} · ${durationOf(event)} min</small></span><span class="event-badge ${event.type === "other" ? "other" : ""} ${event.status === "cancelled" ? "cancelled" : ""}">${event.status === "cancelled" ? "Anulowana" : event.type === "other" ? "Inne" : event.status === "pending" ? "Do potwierdzenia" : "Wizyta"}</span>`;
      button.addEventListener("click", () => openDetails(event.id));
      host.append(button);
    });
  }

  function renderCalendar() {
    $(".calendar-layout").classList.toggle("has-selection", hasSelectedCalendarDate);
    $(".month-select").hidden = hasSelectedCalendarDate;
    $("#month-back").hidden = !hasSelectedCalendarDate;
    $(".month-panel").hidden = hasSelectedCalendarDate;
    $(".agenda-panel").hidden = !hasSelectedCalendarDate;
    $("#add-event").hidden = !hasSelectedCalendarDate;
    renderMonth(); renderWeek(); renderDayEvents();
  }

  function selectDate(date) {
    selectedDate = startOfDay(date);
    hasSelectedCalendarDate = true;
    visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    renderCalendar();
  }

  function openEventFromActivity(id) {
    const event = state.events.find((entry) => entry.id === id);
    if (!event) { showToast("Tego wpisu nie ma już w lokalnym kalendarzu."); return; }
    selectDate(fromKey(event.date));
    setPage("calendar");
    openDetails(id);
  }

  function openDetails(id) {
    const event = state.events.find((entry) => entry.id === id);
    if (!event) return;
    selectedEventId = id;
    $("#detail-type-label").textContent = event.type === "visit" ? "REZERWACJA" : "INNE WYDARZENIE";
    $("#detail-title").textContent = event.name;
    const body = $("#detail-body");
    body.replaceChildren();
    const values = [
      ["Status", event.status === "cancelled" ? "Anulowana" : event.status === "pending" ? "Oczekuje na potwierdzenie" : "Potwierdzona"],
      ["Data", formatDate(fromKey(event.date), { weekday: "long", day: "numeric", month: "long", year: "numeric" })],
      ["Godzina", `${event.start}–${event.end}`],
      ["Czas trwania", `${durationOf(event)} minut`],
      ...(event.type === "visit" ? [["Usługa", event.service], ["Klient", event.name]] : [["Opis", event.service || "—"]])
    ];
    values.forEach(([label, value]) => {
      const line = document.createElement("div"); line.className = "detail-line";
      const left = document.createElement("span"), right = document.createElement("strong"); left.textContent = label; right.textContent = value; line.append(left, right); body.append(line);
    });
    const actions = $("#detail-actions"); actions.replaceChildren();
    $("#reschedule-form").hidden = true;
    if (event.status !== "cancelled") {
      const change = document.createElement("button"); change.type = "button"; change.textContent = "Zmień termin"; change.addEventListener("click", () => showReschedule(event)); actions.append(change);
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "danger"; cancel.textContent = "Anuluj rezerwację"; cancel.addEventListener("click", () => cancelEvent(event)); actions.append(cancel);
      if (event.type === "visit" && event.status === "pending") {
        const confirm = document.createElement("button"); confirm.type = "button"; confirm.textContent = "Potwierdź"; confirm.addEventListener("click", () => { event.status = "confirmed"; saveState("Rezerwacja potwierdzona."); openDetails(event.id); }); actions.append(confirm);
      }
    }
    $("#detail-modal").showModal();
  }

  function showReschedule(event) {
    const form = $("#reschedule-form");
    form.hidden = false;
    $("#reschedule-date").value = event.date;
    mountWheel("reschedule-start", event.start);
    mountWheel("reschedule-end", event.end);
    $("#reschedule-error").textContent = "";
  }

  function cancelEvent(event) {
    if (event.status === "cancelled") return;
    event.status = "cancelled";
    state.activity.unshift({ id: makeId(), eventId: event.id, type: "cancelled", createdAt: Date.now() });
    $("#detail-modal").close();
    saveState("Rezerwacja została oznaczona jako anulowana.");
  }

  function renderServices() {
    const host = $("#service-list"); host.replaceChildren();
    if (!state.services.length) { host.innerHTML = '<div class="empty-state">Lista usług jest pusta. Dodaj pierwszą pozycję.</div>'; return; }
    state.services.forEach((service, index) => {
      const row = document.createElement("div"); row.className = "service-row";
      row.innerHTML = `<label class="service-name-field"><span>Usługa</span><input aria-label="Nazwa usługi" data-field="name" value="${escapeHtml(service.name)}"></label><label class="service-value-field"><span>Cena</span><span class="service-input-unit"><input type="number" min="0" step="1" data-field="price" value="${Number(service.price) || 0}" aria-label="Cena w zł"><small>zł</small></span></label><label class="service-value-field"><span>Czas</span><span class="service-input-unit"><input type="number" min="0" step="5" data-field="duration" value="${Number(service.duration) || 0}" aria-label="Czas w minutach"><small>min</small></span></label><label class="service-toggle"><input class="service-enabled" type="checkbox" data-field="active" ${service.active ? "checked" : ""} aria-label="Usługa aktywna"><span>Aktywna</span></label><button class="service-delete" type="button" aria-label="Usuń usługę">Usuń</button>`;
      $$('[data-field]', row).forEach((input) => input.addEventListener("change", () => {
        const key = input.dataset.field;
        service[key] = key === "active" ? input.checked : key === "name" ? input.value.trim() : Number(input.value);
        saveState("Zapisano usługę.");
      }));
      $(".service-delete", row).addEventListener("click", () => { state.services.splice(index, 1); saveState("Usunięto usługę z lokalnej listy."); });
      host.append(row);
    });
  }

  function renderHours() {
    const host = $("#hours-list"); host.replaceChildren();
    state.hours.forEach((day, index) => {
      const row = document.createElement("div"); row.className = "hours-row";
      row.innerHTML = `<strong>${escapeHtml(day.name)}</strong><label><input type="checkbox" data-field="open" ${day.open ? "checked" : ""}>Otwarte</label><input type="time" data-field="start" value="${escapeHtml(day.start)}" ${day.open ? "" : "disabled"} aria-label="Otwarcie: ${escapeHtml(day.name)}"><span class="time-dash">—</span><input type="time" data-field="end" value="${escapeHtml(day.end)}" ${day.open ? "" : "disabled"} aria-label="Zamknięcie: ${escapeHtml(day.name)}">`;
      $$('[data-field]', row).forEach((input) => input.addEventListener("change", () => {
        const field = input.dataset.field;
        day[field] = field === "open" ? input.checked : input.value;
        if (field === "open") { $("input[data-field=start]", row).disabled = !day.open; $("input[data-field=end]", row).disabled = !day.open; }
      }));
      host.append(row);
    });
    renderDaysOff();
  }

  function renderDaysOff() {
    const host = $("#days-off-list"); host.replaceChildren();
    if (!state.daysOff.length) { host.innerHTML = '<div class="empty-state">Nie dodano wyjątkowych dni wolnych.</div>'; return; }
    state.daysOff.sort((a, b) => a.date.localeCompare(b.date)).forEach((item) => {
      const row = document.createElement("div"); row.className = "dayoff-row";
      row.innerHTML = `<span><strong>${formatDate(fromKey(item.date), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</strong><small>${escapeHtml(item.note || "Salon zamknięty")}</small></span><button class="dayoff-remove" aria-label="Usuń dzień wolny">Usuń</button>`;
      $("button", row).addEventListener("click", () => { state.daysOff = state.daysOff.filter((day) => day.id !== item.id); saveState("Usunięto dzień wolny."); });
      host.append(row);
    });
  }

  function renderContent() {
    $("#content-heading").value = state.content.heading;
    $("#content-description").value = state.content.description;
    const host = $("#admin-gallery"); host.replaceChildren();
    state.gallery.forEach((source, index) => {
      const card = document.createElement("div"); card.className = "gallery-item";
      const img = document.createElement("img"); img.src = source; img.alt = `Zdjęcie salonu ${index + 1}`;
      const label = document.createElement("label"); label.textContent = `Zdjęcie ${index + 1}`;
      const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.setAttribute("aria-label", `Zmień zdjęcie ${index + 1}`);
      input.addEventListener("change", () => {
        const file = input.files?.[0]; if (!file) return;
        if (file.size > 1024 * 1024) { showToast("Wybierz zdjęcie do 1 MB, aby zmieściło się w lokalnym podglądzie."); input.value = ""; return; }
        const reader = new FileReader();
        reader.onload = () => { state.gallery[index] = String(reader.result); img.src = state.gallery[index]; saveState("Zmieniono zdjęcie w lokalnym podglądzie."); };
        reader.readAsDataURL(file);
      });
      label.append(input); card.append(img, label); host.append(card);
    });
  }

  function fillServiceOptions(select) {
    select.replaceChildren();
    const active = state.services.filter((service) => service.active);
    active.forEach((service) => { const option = document.createElement("option"); option.value = service.name; option.textContent = `${service.name} · ${service.duration} min`; select.append(option); });
  }

  function mountWheel(id, value) {
    const wrap = $(`[data-wheel="${id}"]`), hidden = $(`#${id}`);
    if (!wrap || !hidden) return;
    wrap.replaceChildren();
    const [initialHour, initialMinute] = (value || "10:00").split(":").map(Number);
    const hourCol = document.createElement("div"); hourCol.className = "wheel-scroll"; hourCol.setAttribute("role", "listbox"); hourCol.setAttribute("aria-label", "Godzina");
    const colon = document.createElement("span"); colon.className = "wheel-colon"; colon.textContent = ":";
    const minuteCol = document.createElement("div"); minuteCol.className = "wheel-scroll minute-scroll"; minuteCol.setAttribute("role", "listbox"); minuteCol.setAttribute("aria-label", "Minuty");
    const wheel = { id, hidden, hourCol, minuteCol, hour: initialHour, minute: initialMinute < 30 ? 0 : 30, timer: 0 };
    function options(column, values, selected, part) {
      values.forEach((number) => {
        const button = document.createElement("button"); button.type = "button"; button.className = "wheel-option"; button.textContent = String(number).padStart(2, "0"); button.dataset.value = String(number); button.setAttribute("role", "option"); button.setAttribute("aria-selected", String(number === selected));
        button.addEventListener("click", () => { column.scrollTo({ top: values.indexOf(number) * 44, behavior: "smooth" }); wheel[part] = number; updateWheel(wheel); });
        column.append(button);
      });
    }
    options(hourCol, Array.from({ length: 24 }, (_, i) => i), wheel.hour, "hour");
    options(minuteCol, [0, 30], wheel.minute, "minute");
    const onScroll = (column, values, part) => {
      clearTimeout(wheel.timer); wheel.timer = setTimeout(() => { wheel[part] = values[Math.max(0, Math.min(values.length - 1, Math.round(column.scrollTop / 44)))]; updateWheel(wheel); }, 80);
    };
    hourCol.addEventListener("scroll", () => onScroll(hourCol, Array.from({ length: 24 }, (_, i) => i), "hour"), { passive: true });
    minuteCol.addEventListener("scroll", () => onScroll(minuteCol, [0, 30], "minute"), { passive: true });
    wrap.append(hourCol, colon, minuteCol);
    wheels.set(id, wheel);
    requestAnimationFrame(() => { hourCol.scrollTop = wheel.hour * 44; minuteCol.scrollTop = (wheel.minute === 30 ? 1 : 0) * 44; updateWheel(wheel); });
  }

  function updateWheel(wheel) {
    const value = `${String(wheel.hour).padStart(2, "0")}:${String(wheel.minute).padStart(2, "0")}`;
    wheel.hidden.value = value;
    [wheel.hourCol, wheel.minuteCol].forEach((column) => {
      const selected = column === wheel.hourCol ? String(wheel.hour) : String(wheel.minute);
      $$(".wheel-option", column).forEach((button) => {
        const active = button.dataset.value === selected;
        button.classList.toggle("selected", active); button.classList.toggle("near", Math.abs(Number(button.dataset.value) - Number(selected)) <= 1 && !active); button.setAttribute("aria-selected", String(active));
      });
    });
  }

  function checkConflict(date, start, end, omitId = null, type = "visit") {
    const begin = minutesOf(start), finish = minutesOf(end);
    if (finish <= begin) return "Godzina zakończenia musi być późniejsza niż rozpoczęcia.";
    if (type === "visit") {
      const dateObject = fromKey(date), day = state.hours[(dateObject.getDay() + 6) % 7];
      if (isClosed(dateObject) || !day?.open) return "Salon jest zamknięty w wybranym dniu.";
      if (begin < minutesOf(day.start) || finish > minutesOf(day.end)) return `Wizyta musi zmieścić się w godzinach pracy: ${day.start}–${day.end}.`;
    }
    const overlap = state.events.some((event) => event.id !== omitId && event.date === date && event.status !== "cancelled" && begin < minutesOf(event.end) && minutesOf(event.start) < finish);
    return overlap ? "Ten termin nachodzi na inne wydarzenie w kalendarzu." : "";
  }

  function addActivity(event, type) { state.activity.unshift({ id: makeId(), eventId: event.id, type, createdAt: Date.now() }); }

  function openAddEvent() {
    $("#event-form").reset();
    $("#event-date").value = dateKey(selectedDate);
    $("#event-error").textContent = "";
    $("#event-type").value = "visit";
    fillServiceOptions($("#event-service"));
    $("#visit-fields").hidden = false; $("#other-fields").hidden = true;
    $("#event-name").required = true; $("#event-title").required = false;
    mountWheel("event-start", "10:00"); mountWheel("event-end", "10:30");
    $("#event-modal").showModal();
  }

  function submitEvent(formEvent) {
    formEvent.preventDefault();
    const type = $("#event-type").value;
    const name = type === "visit" ? $("#event-name").value.trim() : $("#event-title").value.trim();
    const service = type === "visit" ? $("#event-service").value : "";
    const date = $("#event-date").value, start = $("#event-start").value, end = $("#event-end").value;
    const error = checkConflict(date, start, end, null, type);
    if (error) { $("#event-error").textContent = error; return; }
    if (!name) { $("#event-error").textContent = type === "visit" ? "Wpisz imię i nazwisko klienta." : "Wpisz tytuł wydarzenia."; return; }
    const event = { id: makeId(), type, status: type === "visit" ? "pending" : "confirmed", date, start, end, name, service, createdAt: Date.now() };
    state.events.push(event); addActivity(event, type === "visit" ? "new" : "other_added");
    $("#event-modal").close(); selectDate(fromKey(date)); saveState(type === "visit" ? "Dodano wizytę do lokalnego kalendarza." : "Dodano wydarzenie do lokalnego kalendarza.");
  }

  function submitReschedule(formEvent) {
    formEvent.preventDefault();
    const event = state.events.find((entry) => entry.id === selectedEventId); if (!event) return;
    const date = $("#reschedule-date").value, start = $("#reschedule-start").value, end = $("#reschedule-end").value;
    const error = checkConflict(date, start, end, event.id, event.type);
    if (error) { $("#reschedule-error").textContent = error; return; }
    const oldDate = event.date;
    Object.assign(event, { date, start, end, status: event.status === "pending" ? "pending" : "confirmed" });
    state.activity.unshift({ id: makeId(), eventId: event.id, type: "rescheduled", oldDate, createdAt: Date.now() });
    $("#detail-modal").close(); selectDate(fromKey(date)); saveState("Zmieniono termin wydarzenia.");
  }

  function renderAll() { renderActivity(); renderCalendar(); renderTodayPage(); }

  $$(".nav-link").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
  $$("[data-open-calendar]").forEach((button) => button.addEventListener("click", () => setPage("calendar")));
  $("#month-back").addEventListener("click", () => { hasSelectedCalendarDate = false; renderCalendar(); });
  $("#month-prev").addEventListener("click", () => { if (monthIndex(visibleMonth) > monthIndex(monthStart)) { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1); selectedDate = preferredDateForMonth(visibleMonth); renderCalendar(); } });
  $("#month-next").addEventListener("click", () => { if (monthIndex(visibleMonth) < monthIndex(monthLimit) - 1) { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1); selectedDate = preferredDateForMonth(visibleMonth); renderCalendar(); } });
  $("#week-prev").addEventListener("click", () => { const next = addDays(selectedDate, -7); if (next < monthStart) return; selectedDate = next; visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1); renderCalendar(); });
  $("#week-next").addEventListener("click", () => { const next = addDays(selectedDate, 7); if (next >= monthLimit) return; selectedDate = next; visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1); renderCalendar(); });
  $("#add-event").addEventListener("click", openAddEvent);
  $("#event-type").addEventListener("change", () => {
    const visit = $("#event-type").value === "visit";
    $("#visit-fields").hidden = !visit; $("#other-fields").hidden = visit;
    $("#event-name").required = visit; $("#event-title").required = !visit;
    $("#event-error").textContent = "";
  });
  $("#event-form").addEventListener("submit", submitEvent);
  $("#reschedule-form").addEventListener("submit", submitReschedule);
  $("#add-day-off").addEventListener("click", () => { $("#dayoff-form").reset(); $("#dayoff-date").value = dateKey(selectedDate); $("#dayoff-modal").showModal(); });
  $("#dayoff-form").addEventListener("submit", (event) => {
    event.preventDefault(); const date = $("#dayoff-date").value;
    if (state.daysOff.some((item) => item.date === date)) { showToast("Ten dzień jest już na liście."); return; }
    state.daysOff.push({ id: makeId(), date, note: $("#dayoff-note").value.trim() || "Salon zamknięty" }); $("#dayoff-modal").close(); saveState("Dodano dzień wolny.");
  });
  $("#save-hours").addEventListener("click", () => saveState("Zapisano godziny pracy."));
  $("#add-service").addEventListener("click", () => { $("#service-form").reset(); $("#service-modal").showModal(); });
  $("#service-form").addEventListener("submit", (event) => {
    event.preventDefault(); state.services.push({ name: $("#new-service-name").value.trim(), price: Number($("#new-service-price").value), duration: Number($("#new-service-duration").value), active: true }); $("#service-modal").close(); saveState("Dodano usługę.");
  });

  renderAll();
})();
