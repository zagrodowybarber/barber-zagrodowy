import { getSupabase, isSupabaseConfigured } from "./supabase-client.js";

const services = [
  { id: "haircut", name: "Strzyżenie włosów", price: 70, duration: 40, time: "40 min", icon: "✂" },
  { id: "beard", name: "Strzyżenie brody", price: 50, duration: 25, time: "10–25 min", icon: "♟" },
  { id: "combo", name: "Strzyżenie combo", price: 120, duration: 60, time: "60 min", icon: "✂" },
  { id: "brows", name: "Regulacja brwi", price: 10, duration: 5, time: "5 min" },
  { id: "shave", name: "Golenie", price: 40, duration: 10, time: "10 min", icon: "▱" },
  { id: "wash", name: "Mycie głowy", price: 10, duration: 0, time: "" },
  { id: "nose-wax", name: "Depilacja nosa woskiem", price: 10, duration: 5, time: "5 min", promo: "Pierwszy raz gratis" }

];

let selectedServices = [];
let selectedDate = null;
let selectedSlot = null;
const MAX_BOOKING_MONTH_OFFSET = 1;let monthOffset = 0;
let busySlots = [];
let supabase = null;
let currentUser = null;
let authMode = "login";
let pendingBookingResume = false;
let pendingSignupEmail = "";
let recoveryMode = false;
const views = [...document.querySelectorAll(".view")];
const $ = (selector) => document.querySelector(selector);

function showView(name) {
  views.forEach((view) => view.classList.toggle("active", view.dataset.view === name));
  const navItems = [...document.querySelectorAll(".nav-item")];
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.go === name || ((name === "calendar" || name === "confirm") && item.dataset.go === "booking")));
  const activeIndex = navItems.findIndex((item) => item.classList.contains("active"));
  document.querySelector(".bottom-nav")?.style.setProperty("--active-nav-shift", `${Math.max(activeIndex, 0) * 20}%`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "profile") refreshAccountPanel();
}

document.querySelectorAll("[data-go]").forEach((element) => {
  element.addEventListener("click", () => showView(element.dataset.go));
});

function setMessage(element, message = "", kind = "") {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-error", kind === "error");
  element.classList.toggle("is-success", kind === "success");
}

function selectedServiceList() {
  return selectedServices.map((index) => services[index]).filter(Boolean);
}

function updateSummary() {
  const chosen = selectedServiceList();
  const hasUnknownPrice = chosen.some((service) => service.price === null);
  const price = chosen.reduce((sum, service) => sum + (service.price ?? 0), 0);
  const duration = chosen.reduce((sum, service) => sum + service.duration, 0);
  $("#summary-total").textContent = `${hasUnknownPrice ? "—" : `${price} zł`} · ${duration} min`;
  $("#summary-label").textContent = chosen.length ? `${chosen.length} wybranych usług` : "Wybierz przynajmniej jedną usługę";
  $("#to-calendar").disabled = !chosen.length;
}

function renderServices() {
  const list = $("#service-list");
  list.replaceChildren();
  services.forEach((service, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `service-row${selectedServices.includes(index) ? " selected" : ""}`;
    row.innerHTML = `<div class="service-info"><strong>${service.name}</strong><small>${service.price === null ? "—" : `${service.price} zł`}${service.time ? ` · ${service.time}` : ""}${service.promo ? ` · ${service.promo}` : ""}</small></div><div class="check">${selectedServices.includes(index) ? "✓" : ""}</div>`;
    row.addEventListener("click", () => {
      selectedServices = selectedServices.includes(index) ? selectedServices.filter((item) => item !== index) : [...selectedServices, index];
      renderServices();
    });
    list.append(row);
  });
  updateSummary();
}

function renderPrices() {
  $("#price-list").innerHTML = services.map((service) => `<div class="price-row"><span>${service.name}${service.promo ? ` <small>(${service.promo})</small>` : ""}</span><strong>${service.price === null ? "—" : `${service.price} zł`}</strong></div>`).join("");
}

function formatDate(date) {
  return date.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clearBookingMessage() {
  setMessage($("#booking-message"));
}

async function getMyBookings() {
  if (!supabase || !currentUser) return [];
  const { data, error } = await supabase
    .from("barber_bookings")
    .select("id, booking_date, booking_time, duration_minutes, price_pln, services, status, created_at")
    .eq("customer_user_id", currentUser.id)
    .order("booking_date", { ascending: false })
    .order("booking_time", { ascending: false })
    .limit(10);
  if (error) throw error;
  return data ?? [];
}

function bookingHasNotEnded(booking) {
  if (!booking || !["pending", "confirmed"].includes(booking.status)) return false;
  const end = new Date(`${booking.booking_date}T${booking.booking_time}`).getTime() + Number(booking.duration_minutes || 0) * 60000;
  return end > Date.now();
}

async function hasActiveUpcomingBooking() {
  const bookings = await getMyBookings();
  return bookings.find(bookingHasNotEnded) ?? null;
}

function renderAccountBookings(bookings) {
  const container = $("#my-bookings");
  container.replaceChildren();
  if (!bookings.length) {
    const empty = document.createElement("p");
    empty.textContent = "Nie masz jeszcze zapisanych wizyt.";
    container.append(empty);
    return;
  }

  bookings.forEach((booking) => {
    const card = document.createElement("article");
    card.className = "account-booking";
    const title = document.createElement("strong");
    title.textContent = `${booking.booking_date} · ${String(booking.booking_time).slice(0, 5)}`;
    const serviceNames = Array.isArray(booking.services) ? booking.services.map((item) => item.name).join(", ") : "Usługi";
    const details = document.createElement("p");
    details.textContent = serviceNames;
    const status = document.createElement("small");
    const statusLabels = { pending: "Oczekuje na potwierdzenie salonu", confirmed: "Potwierdzona", cancelled: "Anulowana", completed: "Zakończona" };
    status.textContent = statusLabels[booking.status] ?? booking.status;
    card.append(title, details, status);

    if (bookingHasNotEnded(booking)) {
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "secondary-btn cancel-booking";
      cancelButton.textContent = "Anuluj wizytę";
      cancelButton.addEventListener("click", () => cancelBooking(booking.id));
      card.append(cancelButton);
    }
    container.append(card);
  });
}

async function refreshAccountPanel() {
  const authPanel = $("#auth-panel");
  const accountPanel = $("#account-panel");
  const status = $("#auth-message");
  if (!isSupabaseConfigured()) {
    authPanel.hidden = false;
    accountPanel.hidden = true;
    $("#auth-submit").disabled = true;
    $("#forgot-password").disabled = true;
    setMessage(status, "Rejestracja będzie dostępna po podłączeniu projektu Supabase.");
    return;
  }
  if (recoveryMode) {
    authPanel.hidden = false;
    accountPanel.hidden = true;
    return;
  }
  $("#auth-submit").disabled = false;
  $("#forgot-password").disabled = false;

  if (!currentUser) {
    authPanel.hidden = false;
    accountPanel.hidden = true;
    return;
  }

  authPanel.hidden = true;
  accountPanel.hidden = false;
  const metadata = currentUser.user_metadata ?? {};
  const name = metadata.full_name ?? "";
  const phone = metadata.phone ?? "";
  $("#profile-email").textContent = currentUser.email ?? "";
  $("#profile-name").textContent = name || "Uzupełnij dane kontaktowe poniżej";
  $("#profile-edit-name").value = name;
  $("#profile-edit-phone").value = phone;

  try {
    renderAccountBookings(await getMyBookings());
  } catch (error) {
    const list = $("#my-bookings");
    list.textContent = "Nie udało się pobrać rezerwacji. Spróbuj ponownie za chwilę.";
    console.error("Could not load customer bookings", error);
  }
}

function setAuthMode(mode) {
  authMode = mode === "signup" ? "signup" : "login";
  const registering = authMode === "signup";
  $("#auth-heading").textContent = registering ? "Utwórz konto" : "Zaloguj się";
  $("#auth-submit").textContent = registering ? "Utwórz konto" : "Zaloguj się";
  $("#auth-name-field").hidden = !registering;
  $("#auth-phone-field").hidden = !registering;
  $("#auth-name").required = registering;
  $("#auth-phone").required = registering;
  $("#auth-password").autocomplete = registering ? "new-password" : "current-password";
  document.querySelectorAll("[data-auth-mode]").forEach((button) => button.classList.toggle("active", button.dataset.authMode === authMode));
  setMessage($("#auth-message"));
}

document.querySelectorAll("[data-auth-mode]").forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));

$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) {
    setMessage($("#auth-message"), "Rejestracja i logowanie wymagają najpierw podłączenia Supabase.", "error");
    return;
  }
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  const button = $("#auth-submit");
  button.disabled = true;
  setMessage($("#auth-message"), authMode === "signup" ? "Tworzę konto…" : "Loguję…");
  try {
    if (authMode === "signup") {
      const fullName = $("#auth-name").value.trim();
      const phone = $("#auth-phone").value.trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, phone },
          emailRedirectTo: new URL("./", window.location.href).href
        }
      });
      if (error) throw error;
      pendingSignupEmail = email;
      if (data.session && data.user?.email_confirmed_at) {
        currentUser = data.user;
        setMessage($("#auth-message"), "Konto utworzone. Możesz już wybrać termin.", "success");
        await refreshAccountPanel();
        if (pendingBookingResume) {
          pendingBookingResume = false;
          await continueToCalendar();
        }
      } else {
        $("#resend-confirmation").hidden = false;
        setMessage($("#auth-message"), "Wysłaliśmy link potwierdzający na podany adres e-mail. Kliknij go, a potem wróć na stronę i zaloguj się.", "success");
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const message = /confirm/i.test(error.message) ? "Najpierw potwierdź adres e-mail. Możesz wysłać link ponownie poniżej." : error.message;
        if (/confirm/i.test(error.message)) $("#resend-confirmation").hidden = false;
        throw new Error(message);
      }
      if (!data.user?.email_confirmed_at) {
        pendingSignupEmail = email;
        await supabase.auth.signOut();
        $("#resend-confirmation").hidden = false;
        throw new Error("Najpierw potwierdź adres e-mail. Możesz wysłać link ponownie poniżej.");
      }
      currentUser = data.user;
      setMessage($("#auth-message"), "Zalogowano.", "success");
      await refreshAccountPanel();
      if (pendingBookingResume) {
        pendingBookingResume = false;
        await continueToCalendar();
      }
    }
  } catch (error) {
    setMessage($("#auth-message"), error.message || "Nie udało się wykonać tej operacji.", "error");
  } finally {
    button.disabled = false;
  }
});

$("#forgot-password").addEventListener("click", async () => {
  const email = $("#auth-email").value.trim();
  if (!email) {
    setMessage($("#auth-message"), "Wpisz najpierw swój adres e-mail.", "error");
    return;
  }
  if (!supabase) return setMessage($("#auth-message"), "Reset hasła będzie dostępny po podłączeniu Supabase.", "error");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: new URL("./", window.location.href).href });
  setMessage($("#auth-message"), error ? error.message : "Jeśli konto istnieje, wysłaliśmy e-mail z linkiem do zmiany hasła.", error ? "error" : "success");
});

$("#reset-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !currentUser) {
    setMessage($("#auth-message"), "Otwórz najpierw link do zmiany hasła z e-maila.", "error");
    return;
  }
  const button = $("#reset-password-form button[type='submit']");
  button.disabled = true;
  const { error } = await supabase.auth.updateUser({ password: $("#new-password").value });
  button.disabled = false;
  if (error) {
    setMessage($("#auth-message"), error.message, "error");
    return;
  }
  recoveryMode = false;
  $("#reset-password-form").hidden = true;
  $("#auth-form").hidden = false;
  setMessage($("#auth-message"), "Hasło zostało zmienione. Możesz już korzystać z konta.", "success");
  await refreshAccountPanel();
});

$("#resend-confirmation").addEventListener("click", async () => {
  const email = pendingSignupEmail || $("#auth-email").value.trim();
  if (!email || !supabase) return setMessage($("#auth-message"), "Wpisz adres e-mail użyty podczas rejestracji.", "error");
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: new URL("./", window.location.href).href } });
  setMessage($("#auth-message"), error ? error.message : "Wysłaliśmy nowy link potwierdzający.", error ? "error" : "success");
});

$("#profile-edit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !currentUser) return;
  const { error } = await supabase.auth.updateUser({ data: { full_name: $("#profile-edit-name").value.trim(), phone: $("#profile-edit-phone").value.trim() } });
  if (error) return setMessage($("#profile-message"), error.message, "error");
  const { data } = await supabase.auth.getUser();
  currentUser = data.user;
  setMessage($("#profile-message"), "Zapisano dane kontaktowe.", "success");
  await refreshAccountPanel();
});

$("#sign-out").addEventListener("click", async () => {
  if (supabase) await supabase.auth.signOut();
  currentUser = null;
  setAuthMode("login");
  await refreshAccountPanel();
});

async function cancelBooking(bookingId) {
  if (!supabase) return;
  if (!window.confirm("Anulować tę rezerwację? Po anulowaniu będzie można wybrać nowy termin.")) return;
  const { error } = await supabase.rpc("cancel_barber_booking", { p_booking_id: bookingId });
  if (error) {
    setMessage($("#profile-message"), error.message, "error");
    return;
  }
  setMessage($("#profile-message"), "Rezerwacja została anulowana.", "success");
  await refreshAccountPanel();
}

async function initSupabase() {
  if (!isSupabaseConfigured()) {
    await refreshAccountPanel();
    return;
  }
  try {
    supabase = await getSupabase();
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user ?? null;
    supabase.auth.onAuthStateChange((event, sessionData) => {
      currentUser = sessionData?.user ?? null;
      if (event === "PASSWORD_RECOVERY") {
        recoveryMode = true;
        showView("profile");
        $("#auth-panel").hidden = false;
        $("#account-panel").hidden = true;
        $("#auth-form").hidden = true;
        $("#reset-password-form").hidden = false;
        $("#forgot-password").hidden = true;
        $("#resend-confirmation").hidden = true;
        $("#auth-heading").textContent = "Ustaw nowe hasło";
      }
      refreshAccountPanel();
    });
    await refreshAccountPanel();
    const params = new URLSearchParams(window.location.search);
    if (params.has("code") || window.location.hash.includes("access_token")) {
      window.history.replaceState({}, document.title, window.location.pathname);
      const { data: { session: renewedSession } } = await supabase.auth.getSession();
      currentUser = renewedSession?.user ?? currentUser;
      await refreshAccountPanel();
    }
  } catch (error) {
    setMessage($("#auth-message"), "Nie udało się połączyć z systemem kont. Spróbuj odświeżyć stronę.", "error");
    console.error("Supabase initialization failed", error);
  }
}

$("#to-calendar").addEventListener("click", async () => {
  clearBookingMessage();
  if (!isSupabaseConfigured()) {
    setMessage($("#booking-message"), "Rezerwacje online będą dostępne po podłączeniu kont Supabase.", "error");
    return;
  }
  if (!currentUser) {
    pendingBookingResume = true;
    setMessage($("#auth-message"), "Zaloguj się lub utwórz konto, aby wybrać termin.");
    showView("profile");
    return;
  }
  await continueToCalendar();
});

async function continueToCalendar() {
  if (!supabase || !currentUser) return;
  try {
    const booking = await hasActiveUpcomingBooking();
    if (booking) {
      showView("profile");
      setMessage($("#profile-message"), "Masz już jedną aktywną rezerwację. Odwołaj ją albo poczekaj do wizyty, aby wybrać kolejny termin.");
      return;
    }
    monthOffset = 0;
    renderCalendar();
    showView("calendar");
  } catch (error) {
    setMessage($("#booking-message"), error.message || "Nie udało się sprawdzić rezerwacji.", "error");
  }
}

$("#edit-services").addEventListener("click", () => showView("booking"));
$("#edit-date").addEventListener("click", () => {
  renderCalendar();
  showView("calendar");
});

function renderCalendar() {
  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  $("#month-label").textContent = month.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
  $("#prev-month").disabled = monthOffset === 0;
  $("#next-month").disabled = monthOffset >= MAX_BOOKING_MONTH_OFFSET;
  const grid = $("#calendar-grid");
  grid.replaceChildren();
  const firstDay = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let index = 0; index < firstDay; index += 1) grid.append(document.createElement("span"));
  for (let day = 1; day <= days; day += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = day;
    const past = date < new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sunday = date.getDay() === 0;
    button.disabled = past || sunday;
    button.className = `${button.disabled ? "" : "available"}${selectedDate && toDateKey(date) === toDateKey(selectedDate) ? " selected" : ""}`;
    button.setAttribute("aria-label", formatDate(date));
    button.addEventListener("click", () => {
      selectedDate = date;
      selectedSlot = null;
      renderCalendar();
    });
    grid.append(button);
  }
  if (!selectedDate || selectedDate.getMonth() !== month.getMonth() || selectedDate.getFullYear() !== month.getFullYear()) {
    selectedDate = null;
    selectedSlot = null;
  }
  renderSlots();
}

$("#prev-month").addEventListener("click", () => {
  if (monthOffset > 0) {
    monthOffset -= 1;
    renderCalendar();
  }
});
$("#next-month").addEventListener("click", () => {
  if (monthOffset < MAX_BOOKING_MONTH_OFFSET) {
    monthOffset += 1;
    renderCalendar();
  }
});

function serviceDuration() {
  return selectedServiceList().reduce((sum, service) => sum + service.duration, 0);
}

function buildSlotTimes(date, duration) {
  const closingMinutes = date.getDay() === 6 ? 16 * 60 + 30 : 19 * 60;
  const openingMinutes = 10 * 60;
  const slots = [];
  const blockDuration = duration <= 35 ? 30 : duration <= 65 ? 60 : Math.ceil((duration - 5) / 30) * 30;  const interval = blockDuration <= 30 ? 30 : 60;  for (let minutes = openingMinutes; minutes + blockDuration <= closingMinutes; minutes += interval) {
    const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
    const rest = String(minutes % 60).padStart(2, "0");
    slots.push(`${hours}:${rest}`);
  }
  return slots;
}

function overlapsBusySlot(slotTime, duration, busy) {
  const start = slotTime.split(":").reduce((hours, value) => hours * 60 + Number(value), 0);
  const blockDuration = duration <= 35 ? 30 : duration <= 65 ? 60 : Math.ceil((duration - 5) / 30) * 30;  const end = start + blockDuration;
  return busy.some((item) => {
    const itemTime = String(item.booking_time).slice(0, 5);
    const busyStart = itemTime.split(":").reduce((hours, value) => hours * 60 + Number(value), 0);
    const busyEnd = busyStart + Number(item.duration_minutes || 0);
    return start < busyEnd && busyStart < end;
  });
}

async function renderSlots() {
  const slots = $("#slots");
  const title = $("#chosen-date-title");
  slots.replaceChildren();
  $("#to-confirm").disabled = true;
  if (!selectedDate) {
    title.textContent = "Wybierz dzień";
    return;
  }
  title.textContent = formatDate(selectedDate);
  const duration = serviceDuration();
  const candidates = buildSlotTimes(selectedDate, duration);
  if (!candidates.length) {
    const empty = document.createElement("p");
    empty.textContent = "Łączny czas wybranych usług nie mieści się w godzinach otwarcia.";
    slots.append(empty);
    return;
  }

  try {
    const { data, error } = await supabase.rpc("get_barber_busy_slots", { p_date: toDateKey(selectedDate) });
    if (error) throw error;
    busySlots = data ?? [];
  } catch (error) {
    const message = document.createElement("p");
    message.textContent = error.message || "Nie udało się pobrać wolnych godzin.";
    slots.append(message);
    return;
  }

  candidates.forEach((time) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `slot${selectedSlot === time ? " selected" : ""}`;
    button.textContent = time;
    const slotDateTime = new Date(`${toDateKey(selectedDate)}T${time}`);
    const alreadyPassed = slotDateTime.getTime() <= Date.now();
    const unavailable = alreadyPassed || overlapsBusySlot(time, duration, busySlots);
    button.disabled = unavailable;
    button.setAttribute("aria-label", `${time}${unavailable ? ", niedostępna" : ""}`);
    button.addEventListener("click", () => {
      selectedSlot = time;
      renderSlots();
    });
    slots.append(button);
  });

  $("#to-confirm").disabled = !selectedSlot || !candidates.includes(selectedSlot) || overlapsBusySlot(selectedSlot, duration, busySlots);
}

$("#to-confirm").addEventListener("click", () => {
  if (!selectedDate || !selectedSlot) return;
  const chosen = selectedServiceList();
  const hasUnknownPrice = chosen.some((service) => service.price === null);
  const price = chosen.reduce((sum, service) => sum + (service.price ?? 0), 0);
  const duration = serviceDuration();
  const summary = $("#confirmation-summary");
  summary.innerHTML = `<h2>Twoja wizyta</h2><p><strong>Usługi:</strong> ${chosen.map((service) => service.name).join(", ")}</p><p><strong>Data:</strong> ${selectedDate.toLocaleDateString("pl-PL")}</p><p><strong>Godzina:</strong> ${selectedSlot}</p><p><strong>Czas:</strong> ${duration} min</p><p><strong>Cena:</strong> ${hasUnknownPrice ? "—" : `${price} zł`}</p><p class="muted">Masz jedną aktywną rezerwację naraz. Po odbyciu albo anulowaniu wizyty możesz wybrać kolejny termin.</p>`;
  clearBookingMessage();
  $("#demo-confirm").disabled = false;
  $("#demo-confirm").textContent = "Zarezerwuj wizytę";
  $("#edit-booking-actions").hidden = false;
  showView("confirm");
});

$("#demo-confirm").addEventListener("click", async () => {
  if (!supabase || !currentUser || !selectedDate || !selectedSlot) {
    showView("profile");
    return;
  }
  const metadata = currentUser.user_metadata ?? {};
  const guestName = String(metadata.full_name ?? "").trim();
  const guestPhone = String(metadata.phone ?? "").trim();
  if (guestName.length < 2 || guestPhone.length < 7) {
    showView("profile");
    setMessage($("#profile-message"), "Uzupełnij imię i numer telefonu przed rezerwacją.", "error");
    return;
  }

  const button = $("#demo-confirm");
  button.disabled = true;
  setMessage($("#booking-message"), "Zapisuję wizytę…");
  const { data, error } = await supabase.rpc("create_barber_booking", {
    p_guest_name: guestName,
    p_guest_phone: guestPhone,
    p_booking_date: toDateKey(selectedDate),
    p_booking_time: selectedSlot,
    p_service_ids: selectedServiceList().map((service) => service.id)
  });

  if (error) {
    button.disabled = false;
    setMessage($("#booking-message"), error.message, "error");
    return;
  }

  const bookingId = typeof data === "string" ? data : data?.id;
  $("#confirmation-summary").insertAdjacentHTML("beforeend", `<p class="booking-success"><strong>Rezerwacja zapisana.</strong></p><p>Kod wizyty: <strong>${String(bookingId ?? "").slice(0, 8).toUpperCase()}</strong></p><p>Status: oczekuje na potwierdzenie salonu.</p>`);
  button.textContent = "Wizyta zarezerwowana";
  button.disabled = true;
  $("#edit-booking-actions").hidden = true;
  setMessage($("#booking-message"), "Zapisano wizytę. Szczegóły znajdziesz w profilu.", "success");
  await refreshAccountPanel();
});

renderServices();
renderPrices();
setAuthMode("login");
initSupabase();

const galleryImages = [...document.querySelectorAll(".gallery-grid img")];
if (galleryImages.length) {
  const viewer = document.createElement("div");
  viewer.className = "gallery-lightbox";
  viewer.hidden = true;
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-modal", "true");
  viewer.setAttribute("aria-label", "Podgląd zdjęcia z galerii");
  viewer.innerHTML = '<button class="gallery-lightbox-back" type="button">← Powrót</button><button class="gallery-lightbox-arrow gallery-lightbox-prev" aria-label="Poprzednie zdjęcie">‹</button><figure class="gallery-lightbox-figure"><img class="gallery-lightbox-image" alt=""><figcaption class="gallery-lightbox-count"></figcaption></figure><button class="gallery-lightbox-arrow gallery-lightbox-next" aria-label="Następne zdjęcie">›</button>';
  document.body.append(viewer);
  const image = viewer.querySelector(".gallery-lightbox-image"), count = viewer.querySelector(".gallery-lightbox-count");
  let active = 0;
  const show = (index) => { active = (index + galleryImages.length) % galleryImages.length; image.src = galleryImages[active].src; image.alt = galleryImages[active].alt; count.textContent = (active + 1) + " / " + galleryImages.length; viewer.hidden = false; document.body.classList.add("gallery-lightbox-open"); };
  const close = () => { viewer.hidden = true; document.body.classList.remove("gallery-lightbox-open"); };
  galleryImages.forEach((photo, index) => { photo.tabIndex = 0; photo.setAttribute("role", "button"); photo.addEventListener("click", () => show(index)); photo.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); show(index); } }); });
  viewer.querySelector(".gallery-lightbox-back").addEventListener("click", close);
  viewer.querySelector(".gallery-lightbox-prev").addEventListener("click", () => show(active - 1));
  viewer.querySelector(".gallery-lightbox-next").addEventListener("click", () => show(active + 1));
  viewer.addEventListener("click", (event) => { if (event.target === viewer) close(); });
  document.addEventListener("keydown", (event) => { if (viewer.hidden) return; if (event.key === "Escape") close(); if (event.key === "ArrowLeft") show(active - 1); if (event.key === "ArrowRight") show(active + 1); });
}

