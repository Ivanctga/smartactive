/**
 * main.js — SMART - ACTIVE | Fitness Topics
 *
 * Módulos:
 *   0. Utils         — utilitários reutilizáveis (ScrollBus pub/sub, IntersectionObserver, etc.)
 *   1. Header        — sticky shadow + menu mobile
 *   2. Theme         — dark / light + persistência em localStorage
 *   3. Filter        — filtragem de cards por categoria
 *   4. BackToTop     — botão de voltar ao topo
 *   5. Toast         — notificações temporárias
 *   6. Animations    — scroll reveal via IntersectionObserver
 *   7. StatsCounter  — animação de contagem dos números de estatísticas
 *   8. Keyboard      — navegação por teclado entre cards
 *   9. ScrollSpy     — destaque de links mobile conforme seção visível
 *
 * CORREÇÕES APLICADAS (auditoria):
 *   - [FIX] Dois listeners de scroll independentes substituídos por ScrollBus (pub/sub centralizado)
 *           → Apenas 1 listener ativo; múltiplos subscribers sem overhead duplicado
 *   - [FIX] KeyboardModule: e.preventDefault() agora só é chamado para ArrowLeft/ArrowRight
 *           → ArrowUp/ArrowDown não são mais interceptados, preservando o scroll nativo da página
 *   - [FIX] StatsCounter: proteção contra dupla execução com data-counted="true"
 *           → Elimina race condition quando o observer dispara antes do unobserve processar
 *   - [FIX] ThemeModule desacoplado do ToastModule via CustomEvent
 *           → Sem referência direta entre módulos; ToastModule escuta 'theme:changed'
 *   - [FIX] console.info de produção removido
 *           → Não expõe detalhes de arquitetura no console do usuário final
 *   - [FIX] ScrollSpyModule: ignora seções ocultas pelo FilterModule
 *           → Evita scroll spy ativo em cards com [hidden]
 *
 * @version 2.1.0
 */

'use strict';


/* ════════════════════════════════════════════════════════════════════
   MÓDULO 0 — UTILS
   Funções utilitárias compartilhadas entre módulos.
   ════════════════════════════════════════════════════════════════════ */
const Utils = (() => {

  /**
   * ScrollBus — pub/sub centralizado para eventos de scroll.
   *
   * CORRIGIDO: antes cada módulo criava seu próprio listener com requestAnimationFrame,
   * resultando em múltiplos listeners e múltiplos rAF paralelos.
   * Agora há exatamente 1 listener de scroll e 1 rAF ativo por vez,
   * independentemente de quantos módulos se inscreverem.
   *
   * @type {{ subscribe: (fn: () => void) => () => void }}
   */
  const ScrollBus = (() => {
    const subscribers = new Set();
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          subscribers.forEach(fn => fn());
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });

    /**
     * Inscreve uma função para ser chamada a cada frame de scroll.
     * @param {() => void} fn
     * @returns {() => void} função de cleanup (unsubscribe)
     */
    const subscribe = (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    };

    return { subscribe };
  })();

  /**
   * Cria um IntersectionObserver e observa os elementos fornecidos.
   *
   * @param {Element[]} targets       — elementos a observar
   * @param {(entry: IntersectionObserverEntry, obs: IntersectionObserver) => void} onEnter
   * @param {IntersectionObserverInit} [options]
   * @returns {IntersectionObserver}
   */
  const createObserver = (targets, onEnter, options = {}) => {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          onEnter(entry, obs);
        }
      });
    }, options);

    targets.forEach(el => observer.observe(el));
    return observer;
  };

  /**
   * Verifica se o usuário prefere movimento reduzido.
   * @returns {boolean}
   */
  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return { ScrollBus, createObserver, prefersReducedMotion };
})();


/* ════════════════════════════════════════════════════════════════════
   MÓDULO 1 — HEADER
   Adiciona sombra ao header no scroll e gerencia o menu mobile.
   ════════════════════════════════════════════════════════════════════ */
const HeaderModule = (() => {
  let header, menuToggle, mobileNav;

  /** Aplica/remove .scrolled conforme posição do scroll. */
  const handleScroll = () => {
    header?.classList.toggle('scrolled', window.scrollY > 10);
  };

  /** Atualiza ícone, aria-expanded e classe is-open do menu mobile. */
  const setMenuState = (isOpen) => {
    if (!menuToggle || !mobileNav) return;

    menuToggle.setAttribute('aria-expanded', String(isOpen));
    mobileNav.setAttribute('aria-hidden', String(!isOpen));
    mobileNav.classList.toggle('is-open', isOpen);

    const icon = menuToggle.querySelector('i');
    if (icon) icon.className = isOpen ? 'ri-close-line' : 'ri-menu-line';
  };

  const toggleMenu = () => {
    const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
    setMenuState(!isOpen);
  };

  const closeMenu = () => setMenuState(false);

  const init = () => {
    header     = document.querySelector('.header');
    menuToggle = document.querySelector('#mobile-toggle');
    mobileNav  = document.querySelector('#mobile-nav');

    if (!header) return;

    // CORRIGIDO: usa ScrollBus em vez de criar listener próprio
    Utils.ScrollBus.subscribe(handleScroll);
    handleScroll(); // estado inicial

    menuToggle?.addEventListener('click', toggleMenu);

    // Fecha menu ao clicar em qualquer link do nav mobile
    mobileNav?.querySelectorAll('.mobile-nav__link').forEach(link => {
      link.addEventListener('click', closeMenu);
    });

    // Fecha menu com Escape
    document.addEventListener('keydown', ({ key }) => {
      if (key === 'Escape') closeMenu();
    });
  };

  return { init };
})();


/* ════════════════════════════════════════════════════════════════════
   MÓDULO 2 — THEME
   Alterna dark/light; persiste em localStorage; respeita prefers-color-scheme.

   CORRIGIDO: desacoplado do ToastModule.
   Agora dispara CustomEvent 'theme:changed' em vez de chamar ToastModule.show() diretamente.
   ToastModule escuta esse evento de forma independente.
   ════════════════════════════════════════════════════════════════════ */
const ThemeModule = (() => {
  const STORAGE_KEY = 'smart-active-theme';
  const LIGHT_CLASS = 'light-theme';

  let toggleBtn, themeIcon;

  /**
   * Aplica o tema ao <body> e atualiza ícone e aria-label.
   * @param {boolean} isLight
   */
  const applyTheme = (isLight) => {
    document.body.classList.toggle(LIGHT_CLASS, isLight);

    if (themeIcon) {
      themeIcon.className = isLight ? 'ri-sun-line' : 'ri-moon-line';
    }

    toggleBtn?.setAttribute(
      'aria-label',
      isLight ? 'Alternar para tema escuro' : 'Alternar para tema claro'
    );
  };

  /**
   * Retorna preferência salva ou detecta via sistema.
   * @returns {boolean} true = light mode
   */
  const getInitialTheme = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved === 'light';
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  };

  const toggle = () => {
    const isLight = !document.body.classList.contains(LIGHT_CLASS);
    applyTheme(isLight);
    localStorage.setItem(STORAGE_KEY, isLight ? 'light' : 'dark');

    // CORRIGIDO: desacoplado — dispara evento em vez de chamar ToastModule diretamente
    document.dispatchEvent(
      new CustomEvent('theme:changed', { detail: { isLight } })
    );
  };

  const init = () => {
    toggleBtn = document.querySelector('#theme-toggle');
    themeIcon = document.querySelector('#theme-icon');

    toggleBtn?.addEventListener('click', toggle);
    applyTheme(getInitialTheme());
  };

  return { init };
})();


/* ════════════════════════════════════════════════════════════════════
   MÓDULO 3 — FILTER
   Filtra os cards por categoria e atualiza a contagem visível.
   ════════════════════════════════════════════════════════════════════ */
const FilterModule = (() => {
  let filterBtns, cards, countEl, emptyState;

  /**
   * Mostra/oculta cards e atualiza a contagem acessível.
   * @param {string} filter — 'all' ou valor de data-category
   */
  const applyFilter = (filter) => {
    let visible = 0;

    cards.forEach(card => {
      const match = filter === 'all' || card.dataset.category === filter;
      card.hidden = !match;
      if (match) visible++;
    });

    if (countEl) {
      countEl.textContent = visible === 1
        ? '1 modalidade disponível'
        : `${visible} modalidades disponíveis`;
    }

    if (emptyState) {
      emptyState.hidden = visible > 0;
    }
  };

  /**
   * Atualiza classes e aria-pressed nos botões de filtro.
   * @param {Element} activeBtn
   */
  const updateButtons = (activeBtn) => {
    filterBtns.forEach(btn => {
      const isActive = btn === activeBtn;
      btn.classList.toggle('filter-btn--active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  };

  const handleFilterClick = ({ currentTarget }) => {
    const filter = currentTarget.dataset.filter ?? 'all';
    updateButtons(currentTarget);
    applyFilter(filter);
  };

  const init = () => {
    filterBtns = document.querySelectorAll('.filter-btn');
    cards      = document.querySelectorAll('#topics-grid .card');
    countEl    = document.querySelector('#topic-count');
    emptyState = document.querySelector('#empty-state');

    filterBtns.forEach(btn => btn.addEventListener('click', handleFilterClick));
  };

  return { init };
})();


/* ════════════════════════════════════════════════════════════════════
   MÓDULO 4 — BACK TO TOP
   Exibe/esconde o botão e rola ao topo ao clicar.
   ════════════════════════════════════════════════════════════════════ */
const BackToTopModule = (() => {
  const SHOW_THRESHOLD = 400; // px
  let btn;

  const updateVisibility = () => {
    if (btn) btn.hidden = window.scrollY < SHOW_THRESHOLD;
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const init = () => {
    btn = document.querySelector('#back-to-top');
    if (!btn) return;

    btn.addEventListener('click', scrollToTop);
    // CORRIGIDO: usa ScrollBus em vez de criar listener próprio
    Utils.ScrollBus.subscribe(updateVisibility);
    updateVisibility(); // estado inicial
  };

  return { init };
})();


/* ════════════════════════════════════════════════════════════════════
   MÓDULO 5 — TOAST
   Exibe notificações temporárias (<output>) no centro da tela.

   CORRIGIDO:
   - Escuta o CustomEvent 'theme:changed' para exibir mensagem de tema
     sem acoplamento direto com ThemeModule
   ════════════════════════════════════════════════════════════════════ */
const ToastModule = (() => {
  let toastEl;
  let hideTimer = null;

  /**
   * Exibe uma mensagem temporária.
   * @param {string} message
   * @param {number} [duration=2500] — duração em ms
   */
  const show = (message, duration = 2500) => {
    if (!toastEl) return;

    if (hideTimer) clearTimeout(hideTimer);

    toastEl.textContent = message;
    toastEl.classList.add('is-visible');

    hideTimer = setTimeout(() => {
      toastEl.classList.remove('is-visible');
      hideTimer = null;
    }, duration);
  };

  const init = () => {
    toastEl = document.querySelector('#toast');

    // CORRIGIDO: escuta evento de tema em vez de ser chamado diretamente por ThemeModule
    document.addEventListener('theme:changed', ({ detail }) => {
      show(detail.isLight ? '☀️ Tema claro ativado' : '🌙 Tema escuro ativado');
    });
  };

  return { init, show };
})();


/* ════════════════════════════════════════════════════════════════════
   MÓDULO 6 — ANIMATIONS (Scroll Reveal)
   Usa IntersectionObserver para animar elementos ao entrar na viewport.
   ════════════════════════════════════════════════════════════════════ */
const AnimationsModule = (() => {

  /** Define estado inicial e observa o elemento. */
  const prepareElement = (el) => {
    el.style.opacity    = '0';
    el.style.transform  = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  };

  /** Revela o elemento e para de observá-lo. */
  const revealElement = (entry, observer) => {
    entry.target.style.opacity   = '1';
    entry.target.style.transform = 'translateY(0)';
    observer.unobserve(entry.target);
  };

  const init = () => {
    if (Utils.prefersReducedMotion()) return;

    const targets = [
      ...document.querySelectorAll('.stat, .section__head, .filter-bar'),
    ];

    if (!targets.length) return;

    targets.forEach(prepareElement);
    Utils.createObserver(targets, revealElement, { threshold: 0.12 });
  };

  return { init };
})();


/* ════════════════════════════════════════════════════════════════════
   MÓDULO 7 — STATS COUNTER
   Anima os números de estatísticas (ex: "0" → "200+") ao entrar na viewport.

   CORRIGIDO: proteção contra dupla execução via data-counted="true".
   Elimina race condition quando o observer dispara múltiplas vezes
   antes que o unobserve seja processado em viewports com scroll rápido.
   ════════════════════════════════════════════════════════════════════ */
const StatsCounterModule = (() => {

  /**
   * Easing ease-out cúbico.
   * @param {number} t — progresso [0, 1]
   */
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  /**
   * Anima um elemento numérico do zero até seu valor final.
   * @param {HTMLElement} el
   */
  const animateNumber = (el) => {
    // CORRIGIDO: guarda para evitar dupla execução em race condition
    if (el.dataset.counted) return;
    el.dataset.counted = 'true';

    const rawText = el.textContent.trim();
    const suffix  = rawText.replace(/[\d.]/g, '');
    const target  = parseFloat(rawText.replace(/[^\d.]/g, ''));

    if (isNaN(target)) return;

    const duration  = 1200;
    const startTime = performance.now();

    const tick = (currentTime) => {
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const current  = target * easeOut(progress);

      el.textContent = (Number.isInteger(target)
        ? Math.round(current)
        : current.toFixed(1)) + suffix;

      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  };

  const init = () => {
    if (Utils.prefersReducedMotion()) return;

    const statsEls = [...document.querySelectorAll('.stat__num')];
    if (!statsEls.length) return;

    Utils.createObserver(
      statsEls,
      (entry, observer) => {
        animateNumber(entry.target);
        observer.unobserve(entry.target);
      },
      { threshold: 0.5 }
    );
  };

  return { init };
})();


/* ════════════════════════════════════════════════════════════════════
   MÓDULO 8 — KEYBOARD NAVIGATION
   Permite navegar entre cards com setas e acionar o CTA com Enter.

   CORRIGIDO: e.preventDefault() agora só é chamado para ArrowLeft/ArrowRight.
   ArrowUp/ArrowDown NÃO são mais interceptados — preserva o scroll nativo da página.
   Antes, qualquer card focado bloqueava completamente a rolagem por teclado.
   ════════════════════════════════════════════════════════════════════ */
const KeyboardModule = (() => {

  /**
   * Retorna os cards visíveis do grid.
   * @returns {HTMLElement[]}
   */
  const getVisibleCards = () =>
    [...document.querySelectorAll('#topics-grid .card:not([hidden])')];

  const handleKeydown = (e) => {
    const cards = getVisibleCards();
    const index = cards.indexOf(document.activeElement);
    if (index === -1) return;

    // CORRIGIDO: apenas ArrowLeft/ArrowRight para navegação horizontal entre cards.
    // ArrowUp/ArrowDown foram removidos — o scroll nativo da página deve ser preservado.
    // Enter aciona o CTA do card focado.
    const actions = {
      ArrowRight: () => (index + 1) % cards.length,
      ArrowLeft:  () => (index - 1 + cards.length) % cards.length,
      Enter:      () => {
        cards[index]?.querySelector('.card__cta')?.click();
        return null;
      },
    };

    const action = actions[e.key];
    if (!action) return;

    // CORRIGIDO: preventDefault só para as teclas que realmente tratamos
    e.preventDefault();
    const nextIndex = action();
    if (nextIndex !== null) cards[nextIndex]?.focus();
  };

  const init = () => {
    document.addEventListener('keydown', handleKeydown);
  };

  return { init };
})();


/* ════════════════════════════════════════════════════════════════════
   MÓDULO 9 — SCROLL SPY
   Destaca o link do menu mobile correspondente à seção visível.

   CORRIGIDO: ignora seções ocultas pelo FilterModule ([hidden]).
   Antes, o scroll spy poderia ativar links de cards invisíveis,
   criando estado inconsistente entre filtro e navegação mobile.
   ════════════════════════════════════════════════════════════════════ */
const ScrollSpyModule = (() => {

  const init = () => {
    // Observa TODOS os articles com id, mas o callback verifica hidden no momento da intersecção.
    // Isso garante que seções filtradas depois do init não ativem links erroneamente.
    const sections = [...document.querySelectorAll('article[id]')];
    const navLinks = [...document.querySelectorAll('.mobile-nav__link')];

    if (!sections.length || !navLinks.length) return;

    Utils.createObserver(
      sections,
      (entry) => {
        // CORRIGIDO: verifica hidden no momento da intersecção, não apenas no init
        // Garante compatibilidade mesmo quando filtros ocultam cards após a montagem
        if (entry.target.hidden) return;

        const id = entry.target.id;
        navLinks.forEach(link => {
          const isActive = link.getAttribute('href') === `#${id}`;
          link.classList.toggle('is-active', isActive);
        });
      },
      { rootMargin: '-40% 0px -40% 0px' }
    );
  };

  return { init };
})();


/* ════════════════════════════════════════════════════════════════════
   MÓDULO 10 — CARD DETAIL PANEL
   Exibe o painel de conteúdo extra ao lado do card quando:
     a) Um link da navbar mobile é clicado (#cardio, #weight, etc.)
     b) O filtro da barra resulta em exatamente 1 card visível

   Quando ativo:
     - O grid recebe .has-detail → 2 colunas (card | painel)
     - O painel do card recebe .is-active → entra com animação
   Quando desativado (voltar p/ "Todas" ou outro filtro):
     - Remove .has-detail e .is-active
   ════════════════════════════════════════════════════════════════════ */
const DetailModule = (() => {

  let grid;

  /** Remove qualquer painel ativo sem disparar transição dupla. */
  const clearActive = () => {
    grid?.classList.remove('has-detail');
    document.querySelectorAll('.card-detail.is-active').forEach(panel => {
      panel.classList.remove('is-active');
      panel.hidden = true;
    });
  };

  /**
   * Ativa o painel correspondente ao cardId.
   * @param {string} cardId — ex: 'cardio', 'weight'
   */
  const activate = (cardId) => {
    clearActive();
    const panel = document.getElementById(`${cardId}-detail`);
    if (!panel) return;

    panel.hidden = false;
    // Força reflow para a animação CSS funcionar
    void panel.offsetWidth;
    panel.classList.add('is-active');
    grid?.classList.add('has-detail');
  };

  /**
   * Verifica quantos cards estão visíveis após um filtro.
   * Se exatamente 1, ativa o painel. Se mais, limpa.
   */
  const syncWithFilter = () => {
    const visible = [...document.querySelectorAll('#topics-grid .card:not([hidden])')];
    if (visible.length === 1) {
      activate(visible[0].id);
    } else {
      clearActive();
    }
  };

  const init = () => {
    grid = document.querySelector('#topics-grid');

    // ── Navbar mobile links ───────────────────────────────────────────
    // Quando clicam em "Cardio Exercise" na navbar, rolam para o card
    // E ativamos o painel ao lado.
    document.querySelectorAll('.mobile-nav__link').forEach(link => {
      link.addEventListener('click', () => {
        const targetId = link.getAttribute('href')?.replace('#', '');
        if (targetId) {
          // Pequeno delay para o scroll terminar antes de mostrar o painel
          setTimeout(() => activate(targetId), 80);
        }
      });
    });

    // ── Card CTA buttons ("Explorar") ────────────────────────────────
    // Ao clicar em "Explorar" dentro de um card, aciona o botão de filtro
    // correspondente à categoria do card — destacando-o na filter bar
    // e exibindo apenas aquele card (mesmo comportamento dos botões da navbar).
    document.querySelectorAll('#topics-grid .card__cta').forEach(cta => {
      cta.addEventListener('click', (e) => {
        e.preventDefault();
        const card     = cta.closest('.card');
        const category = card?.dataset.category;
        if (!category) return;

        const filterBtn = document.querySelector(`.filter-btn[data-filter="${category}"]`);
        filterBtn?.click();

        // Rola suavemente até o card após o filtro ser aplicado
        setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      });
    });

    // ── Footer nav links ──────────────────────────────────────────────
    document.querySelectorAll('.footer-nav a').forEach(link => {
      link.addEventListener('click', () => {
        const targetId = link.getAttribute('href')?.replace('#', '');
        if (targetId) setTimeout(() => activate(targetId), 80);
      });
    });

    // ── Filter bar ────────────────────────────────────────────────────
    // Hooking into filter results: após cada clique no filtro,
    // checamos se sobrou 1 card visível para ativar o painel.
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Executa APÓS o FilterModule processar (próximo tick)
        setTimeout(syncWithFilter, 0);
      });
    });
  };

  return { init, activate, clearActive };
})();


/* ════════════════════════════════════════════════════════════════════
   INIT — Ponto de entrada
   Inicializa todos os módulos após o DOM estar completamente carregado.

   Ordem importa:
   - ToastModule primeiro: escuta eventos que outros módulos podem disparar
   - ThemeModule depois: pode disparar 'theme:changed' que Toast escuta
   ════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Toast primeiro: escuta eventos de outros módulos
  ToastModule.init();
  HeaderModule.init();
  ThemeModule.init();
  FilterModule.init();
  BackToTopModule.init();
  AnimationsModule.init();
  StatsCounterModule.init();
  KeyboardModule.init();
  ScrollSpyModule.init();
  DetailModule.init();

  // CORRIGIDO: console.info removido de produção
  // Não expõe detalhes de arquitetura no console do usuário final
});