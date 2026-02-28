/**
 * SMART ACTIVE — Main JavaScript
 * Architecture: Module pattern, event delegation, clean separation of concerns
 */

/* ═══════════════════════════════════════════════════════
   UTILS
   ═══════════════════════════════════════════════════════ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const debounce = (fn, ms = 100) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

/* ═══════════════════════════════════════════════════════
   NAV MODULE
   ═══════════════════════════════════════════════════════ */
const Nav = (() => {
  const header  = $('#header');
  const menu    = $('#nav-menu');
  const toggle  = $('#nav-toggle');
  const close   = $('#nav-close');
  const links   = $$('.nav__link');
  const sections = $$('section[id]');

  const openMenu  = () => { menu?.classList.add('show-menu'); toggle?.setAttribute('aria-expanded', 'true'); };
  const closeMenu = () => { menu?.classList.remove('show-menu'); toggle?.setAttribute('aria-expanded', 'false'); };

  const onScroll = () => {
    const y = window.scrollY;

    // Header background
    header?.classList.toggle('bg-header', y >= 60);

    // Active link
    sections.forEach(sec => {
      const top    = sec.offsetTop - 80;
      const bottom = top + sec.offsetHeight;
      const link   = $(`.nav__link[href="#${sec.id}"]`);
      link?.classList.toggle('active-link', y >= top && y < bottom);
    });

    // Scroll-up button
    $('#scroll-up')?.classList.toggle('show-scroll', y >= 400);
  };

  const init = () => {
    toggle?.addEventListener('click', openMenu);
    close?.addEventListener('click', closeMenu);
    links.forEach(l => l.addEventListener('click', closeMenu));

    // Close on outside click (mobile)
    document.addEventListener('click', e => {
      if (menu?.classList.contains('show-menu') && !menu.contains(e.target) && !toggle?.contains(e.target)) {
        closeMenu();
      }
    });

    window.addEventListener('scroll', debounce(onScroll, 8), { passive: true });
    onScroll(); // run once on load
  };

  return { init };
})();

/* ═══════════════════════════════════════════════════════
   SPACE GALLERY MODULE
   ═══════════════════════════════════════════════════════ */
const SpaceGallery = (() => {
  let current = 0;

  const init = () => {
    const banner  = $('#space-banner');
    const track   = $('#space-track');
    const viewport= $('#space-viewport');
    const btnPrev = $('#space-prev');
    const btnNext = $('#space-next');

    if (!banner || !track) return;

    const thumbs = $$('.space__thumb', track);
    if (!thumbs.length) return;

    // Determine initial active
    const initActive = thumbs.findIndex(t => t.classList.contains('space__thumb--active'));
    current = initActive >= 0 ? initActive : 0;

    /* ── helpers ── */

    const thumbSize = () => {
      const first = thumbs[0];
      if (!first) return 0;
      const rect = first.getBoundingClientRect();
      const style = getComputedStyle(track);
      const gap = parseFloat(style.gap) || 12;
      return rect.width + gap;
    };

    const visibleCount = () => {
      const vp = viewport?.getBoundingClientRect();
      if (!vp) return 1;
      const size = thumbSize();
      return size > 0 ? Math.max(1, Math.floor(vp.width / size)) : 1;
    };

    let trackOffset = 0;

    const moveTrack = (offset) => {
      const max = Math.max(0, thumbs.length - visibleCount());
      trackOffset = Math.max(0, Math.min(offset, max));
      const px = trackOffset * thumbSize();
      track.style.transform = `translateX(-${px}px)`;
    };

    const ensureVisible = (idx) => {
      const vis = visibleCount();
      if (idx < trackOffset)               moveTrack(idx);
      else if (idx >= trackOffset + vis)   moveTrack(idx - vis + 1);
    };

    const swapBanner = (src, alt) => {
      banner.style.transition = 'opacity .2s ease, transform .2s ease';
      banner.style.opacity = '0';
      banner.style.transform = 'scale(1.02)';
      setTimeout(() => {
        banner.src = src;
        banner.alt = alt || '';
        banner.style.opacity = '1';
        banner.style.transform = 'scale(1)';
      }, 200);
    };

    const goTo = (index) => {
      const total = thumbs.length;
      current = ((index % total) + total) % total;

      thumbs.forEach(t => t.classList.remove('space__thumb--active'));
      thumbs[current].classList.add('space__thumb--active');

      const img = thumbs[current].querySelector('img');
      if (img) swapBanner(img.src, img.alt);

      ensureVisible(current);
    };

    /* ── events ── */
    btnPrev?.addEventListener('click', () => goTo(current - 1));
    btnNext?.addEventListener('click', () => goTo(current + 1));

    thumbs.forEach((thumb, i) => {
      thumb.addEventListener('click', () => goTo(i));
    });

    let touchStartX = 0;
    banner.parentElement?.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    banner.parentElement?.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) goTo(dx < 0 ? current + 1 : current - 1);
    }, { passive: true });

    window.addEventListener('resize', debounce(() => {
      moveTrack(trackOffset);
      ensureVisible(current);
    }, 150));

    // Keyboard navigation
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')  goTo(current - 1);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(current + 1);
    });

    goTo(current);
  };

  return { init };
})();

/* ═══════════════════════════════════════════════════════
   BMI CALCULATOR MODULE
   ═══════════════════════════════════════════════════════ */
const BMICalc = (() => {
  const form    = $('#calculate-form');
  const cmInput = $('#calculate-cm');
  const kgInput = $('#calculate-kg');
  const message = $('#calculate-message');

  const showMessage = (text, type = 'success') => {
    if (!message) return;
    message.textContent = text;
    message.className = `calculate__result ${type === 'success' ? 'color-green' : 'color-red'}`;
    const delay = type === 'success' ? 5000 : 3500;
    setTimeout(() => { message.textContent = ''; message.className = 'calculate__result'; }, delay);
  };

  const bmi = (h, w) => Math.round(w / ((h / 100) ** 2));

  const classify = (b) => {
    if (b < 18.5) return `IMC ${b} — Abaixo do peso 💪 Vamos trabalhar nisso!`;
    if (b < 25)   return `IMC ${b} — Peso ideal 🏆 Excelente! Continue assim!`;
    if (b < 30)   return `IMC ${b} — Sobrepeso 📊 Podemos te ajudar a melhorar!`;
    return               `IMC ${b} — Obesidade 🎯 Nossos programas são para você!`;
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const h = parseFloat(cmInput?.value);
    const w = parseFloat(kgInput?.value);

    if (!h || !w || h < 50 || h > 300 || w < 20 || w > 500) {
      showMessage('Preencha altura e peso com valores válidos 👀', 'error');
      return;
    }

    showMessage(classify(bmi(h, w)), 'success');
    form?.reset();
  };

  const init = () => {
    form?.addEventListener('submit', onSubmit);

    // Allow Enter on inputs
    [cmInput, kgInput].forEach(input => {
      input?.addEventListener('keydown', e => {
        if (e.key === 'Enter') form?.dispatchEvent(new Event('submit', { cancelable: true }));
      });
    });
  };

  return { init };
})();

/* ═══════════════════════════════════════════════════════
   CONTACT FORM MODULE
   ═══════════════════════════════════════════════════════ */
const ContactForm = (() => {
  const form    = $('#contact-form');
  const input   = $('#contact-user');
  const message = $('#contact-message');

  const showMessage = (text, type = 'success') => {
    if (!message) return;
    message.textContent = text;
    message.className = `footer__message ${type === 'success' ? 'color-green' : 'color-red'}`;
    setTimeout(() => { message.textContent = ''; message.className = 'footer__message'; }, 3500);
  };

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const onSubmit = (e) => {
    e.preventDefault();
    const email = input?.value.trim();

    if (!email) {
      showMessage('Por favor, insira seu e-mail 👆', 'error');
      return;
    }
    if (!isValidEmail(email)) {
      showMessage('E-mail inválido. Tente novamente 📧', 'error');
      return;
    }

    // EmailJS integration (optional)
    if (typeof emailjs !== 'undefined') {
      emailjs
        .sendForm('service_rkph8fe', 'template_1ypfxkg', '#contact-form', 'CKUdbbQoDpRLMSNDq')
        .then(
          () => { showMessage('Inscrição realizada com sucesso! 🎉'); form.reset(); },
          () => showMessage('Erro ao enviar. Tente novamente 😔', 'error')
        );
    } else {
      // Fallback without EmailJS
      showMessage('Inscrição realizada com sucesso! 🎉');
      form.reset();
    }
  };

  const init = () => { form?.addEventListener('submit', onSubmit); };
  return { init };
})();

/* ═══════════════════════════════════════════════════════
   SCROLL REVEAL MODULE
   ═══════════════════════════════════════════════════════ */
const Reveal = (() => {
  const init = () => {
    if (typeof ScrollReveal === 'undefined') return;

    const sr = ScrollReveal({
      origin: 'bottom',
      distance: '40px',
      duration: 900,
      delay: 100,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      reset: false,
    });

    // Hero
    sr.reveal('.home__data',   { origin: 'left',   delay: 200 });
    sr.reveal('.home__visual', { origin: 'right',  delay: 400 });
    sr.reveal('.home__scroll-indicator', { origin: 'bottom', delay: 800 });

    // Sections
    sr.reveal('.section__header', { delay: 100 });
    sr.reveal('.program__card',   { interval: 80,  delay: 150 });
    sr.reveal('.logos__inner',    { origin: 'top', delay: 100 });

    // Choose
    sr.reveal('.choose__img-wrap', { origin: 'left',  delay: 150 });
    sr.reveal('.choose__content',  { origin: 'right', delay: 250 });

    // Pricing
    sr.reveal('.pricing__card',   { interval: 100, delay: 150 });

    // Calculate
    sr.reveal('.calculate__content', { origin: 'left',  delay: 150 });
    sr.reveal('.calculate__visual',  { origin: 'right', delay: 300 });

    // Footer
    sr.reveal('.footer__brand',      { origin: 'left',  delay: 100 });
    sr.reveal('.footer__links-grid', { origin: 'right', delay: 200 });
  };

  return { init };
})();

/* ═══════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  Nav.init();
  SpaceGallery.init();
  BMICalc.init();
  ContactForm.init();
  Reveal.init();
});
