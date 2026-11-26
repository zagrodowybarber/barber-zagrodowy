const carousel = document.querySelector(".welcome-photo");
const slides = [...document.querySelectorAll(".welcome-slide")];
const dots = [...document.querySelectorAll(".welcome-slide-dot")];

if (carousel && slides.length > 1 && dots.length === slides.length) {
  let activeSlide = 0;
  let manualPauseUntil = 0;

  const showSlide = (index) => {
    activeSlide = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => slide.classList.toggle("active", slideIndex === activeSlide));
    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === activeSlide;
      dot.classList.toggle("active", active);
      if (active) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  };

  carousel.querySelectorAll("[data-slide-step]").forEach((button) => {
    button.addEventListener("click", () => {
      showSlide(activeSlide + Number(button.dataset.slideStep));
      manualPauseUntil = Date.now() + 12000;
    });
  });
  dots.forEach((dot) => dot.addEventListener("click", () => {
    showSlide(Number(dot.dataset.slideTo));
    manualPauseUntil = Date.now() + 12000;
  }));

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.setInterval(() => {
      if (Date.now() >= manualPauseUntil && !document.hidden && !carousel.matches(":hover, :focus-within")) showSlide(activeSlide + 1);
    }, 5000);
  }
}
