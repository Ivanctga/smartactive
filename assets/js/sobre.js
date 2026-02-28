/**
 * SMART ACTIVE — sobre.js
 * Página Institucional · Módulos: Nav, Scroll, FadeUp, Counters, Carousel, Newsletter
 */

'use strict';

/* ═══════════════════════════════════════════════════════
   UTILS
   ═══════════════════════════════════════════════════════ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const debounce = (fn, ms = 100) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

/* ═══════════════════════════════════════════════════════
   NAV MODULE
   ═══════════════════════════════════════════════════════ */
const Nav = (() => {
  const header   = $('#header');
  const menu     = $('#nav-menu');
  const toggle   = $('#nav-toggle');
  const close    = $('#nav-close');
  const links    = $$('.nav__link');
  const scrollUp = $('#scroll-up');

  const open  = () => { menu?.classList.add('show-menu');    toggle?.setAttribute('aria-expanded', 'true');  };
  const shut  = () => { menu?.classList.remove('show-menu'); toggle?.setAttribute('aria-expanded', 'false'); };

  const onScroll = () => {
    const y = window.scrollY;
    header?.classList.toggle('bg-header', y >= 60);
    scrollUp?.classList.toggle('show-scroll', y >= 400);
  };

  const init = () => {
    toggle?.addEventListener('click', open);
    close?.addEventListener('click', shut);
    links.forEach(l => l.addEventListener('click', shut));

    // Close on outside tap
    document.addEventListener('click', e => {
      if (menu?.classList.contains('show-menu') && !menu.contains(e.target) && !toggle?.contains(e.target)) shut();
    });

    window.addEventListener('scroll', debounce(onScroll, 8), { passive: true });
    onScroll();
  };

  return { init };
})();

/* ═══════════════════════════════════════════════════════
   FADE-UP (IntersectionObserver)
   ═══════════════════════════════════════════════════════ */
const FadeUp = (() => {
  const init = () => {
    const els = $$('.fade-up');
    if (!els.length) return;

    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('is-visible'));
      return;
    }

    const obs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); obs.unobserve(e.target); }
      }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    els.forEach(el => obs.observe(el));
  };

  return { init };
})();

/* ═══════════════════════════════════════════════════════
   ANIMATED COUNTERS
   ═══════════════════════════════════════════════════════ */
const Counters = (() => {
  const animate = (el) => {
    const target = parseInt(el.dataset.target, 10);
    if (isNaN(target)) return;

    const dur = 1800;
    const start = performance.now();

    const step = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 4); // quartic ease-out
      el.textContent = Math.floor(eased * target);
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = target;
    };

    requestAnimationFrame(step);
  };

  const init = () => {
    const nums = $$('.inst-about__counter-num');
    if (!nums.length || !('IntersectionObserver' in window)) return;

    const obs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { animate(e.target); obs.unobserve(e.target); }
      }),
      { threshold: 0.5 }
    );

    nums.forEach(el => obs.observe(el));
  };

  return { init };
})();

/* ═══════════════════════════════════════════════════════
   SMOOTH SCROLL (with header offset)
   ═══════════════════════════════════════════════════════ */
const SmoothScroll = (() => {
  const init = () => {
    $$('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const id = a.getAttribute('href');
        if (!id || id === '#') return;
        const target = $(id);
        if (!target) return;
        e.preventDefault();
        const header = $('#header');
        const offset = (header?.offsetHeight ?? 0) + 16;
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
      });
    });
  };

  return { init };
})();

/* ═══════════════════════════════════════════════════════
   TEAM CAROUSEL
   ═══════════════════════════════════════════════════════ */
const Carousel = (() => {
  const init = () => {
    const carousel  = $('#teamCarousel');
    if (!carousel) return;

    const track     = $('#carouselTrack');
    const btnPrev   = $('#carouselPrev');
    const btnNext   = $('#carouselNext');
    const dotsWrap  = $('#carouselDots');
    const cards     = $$('.inst-personal-card', track);
    const TOTAL     = cards.length;
    const GAP       = 20; // px — matches CSS gap: 1.25rem ≈ 20px

    let current  = 0;
    let visible  = 4;
    let autoPlay = null;

    /* ── helpers ── */
    const getVisible = () => {
      const w = window.innerWidth;
      if (w < 560)  return 1;
      if (w < 768)  return 2;
      if (w < 1024) return 3;
      return 4;
    };

    const cardStep = () => {
      if (!cards[0]) return 0;
      return cards[0].getBoundingClientRect().width + GAP;
    };

    const maxIdx = () => Math.max(0, TOTAL - visible);

    /* ── translate ── */
    const translate = (idx, animate = true) => {
      track.style.transition = animate ? 'transform .55s cubic-bezier(.4,0,.2,1)' : 'none';
      track.style.transform  = `translateX(-${idx * cardStep()}px)`;
    };

    /* ── dots ── */
    const buildDots = () => {
      dotsWrap.innerHTML = '';
      const total = maxIdx() + 1;
      for (let i = 0; i < total; i++) {
        const btn = document.createElement('button');
        btn.className = 'inst-team__dot' + (i === 0 ? ' is-active' : '');
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-label', `Ir para posição ${i + 1}`);
        btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
        btn.addEventListener('click', () => goTo(i));
        dotsWrap.appendChild(btn);
      }
    };

    const updateDots = () => {
      $$('.inst-team__dot', dotsWrap).forEach((d, i) => {
        d.classList.toggle('is-active', i === current);
        d.setAttribute('aria-selected', i === current ? 'true' : 'false');
      });
    };

    const updateArrows = () => {
      if (btnPrev) btnPrev.disabled = current === 0;
      if (btnNext) btnNext.disabled = current >= maxIdx();
    };

    /* ── navigation ── */
    const goTo = (idx, animate = true) => {
      current = Math.max(0, Math.min(idx, maxIdx()));
      translate(current, animate);
      updateDots();
      updateArrows();
    };

    const next = () => goTo(current >= maxIdx() ? 0 : current + 1);
    const prev = () => goTo(current <= 0 ? maxIdx() : current - 1);

    /* ── autoplay ── */
    const startAuto = () => {
      if (autoPlay) return;
      autoPlay = setInterval(next, 2400);
    };
    const stopAuto = () => { clearInterval(autoPlay); autoPlay = null; };

    carousel.addEventListener('mouseenter', startAuto);
    carousel.addEventListener('mouseleave', stopAuto);

    /* ── touch / swipe ── */
    let touchX = 0;
    carousel.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; stopAuto(); }, { passive: true });
    carousel.addEventListener('touchend',   e => {
      const dx = touchX - e.changedTouches[0].clientX;
      if (Math.abs(dx) > 48) dx > 0 ? next() : prev();
    }, { passive: true });

    /* ── keyboard ── */
    carousel.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    });

    /* ── buttons ── */
    btnPrev?.addEventListener('click', prev);
    btnNext?.addEventListener('click', next);

    /* ── resize ── */
    window.addEventListener('resize', debounce(() => {
      visible = getVisible();
      buildDots();
      if (current > maxIdx()) current = maxIdx();
      translate(current, false);
      updateDots();
      updateArrows();
    }, 150));

    /* ── init ── */
    visible = getVisible();
    buildDots();
    goTo(0, false);
  };

  return { init };
})();

/* ═══════════════════════════════════════════════════════
   NEWSLETTER FORM
   ═══════════════════════════════════════════════════════ */
const Newsletter = (() => {
  const form    = $('#contact-form');
  const input   = $('#contact-user');
  const message = $('#contact-message');

  const show = (text, type = 'success') => {
    if (!message) return;
    message.textContent = text;
    message.className   = `footer__message ${type === 'success' ? 'color-green' : 'color-red'}`;
    setTimeout(() => { message.textContent = ''; message.className = 'footer__message'; }, type === 'success' ? 4500 : 3500);
  };

  const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

  const onSubmit = e => {
    e.preventDefault();
    const email = input?.value.trim() ?? '';

    if (!email)          return show('Preencha o campo de e-mail 👆', 'error');
    if (!isEmail(email)) return show('Por favor, insira um e-mail válido 📧', 'error');

    if (typeof emailjs !== 'undefined') {
      emailjs.sendForm('service_rkph8fe', 'template_1ypfxkg', '#contact-form', 'CKUdbbQoDpRLMSNDq')
        .then(
          () => { show('Inscrição realizada com sucesso! 🎉'); form.reset(); },
          () => show('Erro ao enviar. Tente novamente 😔', 'error')
        );
    } else {
      // Fallback sem EmailJS carregado
      show('Inscrição realizada com sucesso! 🎉');
      form.reset();
    }
  };

  const init = () => { form?.addEventListener('submit', onSubmit); };
  return { init };
})();

/* ═══════════════════════════════════════════════════════
   BOOTSTRAP
   ═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  Nav.init();
  FadeUp.init();
  Counters.init();
  SmoothScroll.init();
  Carousel.init();
  Newsletter.init();
});
