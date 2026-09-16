// Built Capital Advisory — shared site behavior (no dependencies)

// Logo intro: runs before anything else so it can cover first paint.
(function () {
  const intro = document.getElementById('intro');
  if (!intro) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const alreadyPlayed = sessionStorage.getItem('bca-intro-played');

  if (reducedMotion || alreadyPlayed) {
    intro.remove();
    return;
  }
  sessionStorage.setItem('bca-intro-played', '1');
  document.body.classList.add('intro-active');

  const finish = () => {
    intro.removeEventListener('click', finish);
    intro.classList.add('hide');
    document.body.classList.remove('intro-active');
    setTimeout(() => intro.remove(), 550);
  };

  intro.addEventListener('click', finish);
  requestAnimationFrame(() => {
    setTimeout(() => intro.classList.add('zoom'), 200);
    setTimeout(finish, 200 + 1500);
  });
})();

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav-toggle');

  // Dismissible alert bar
  const alertBar = document.getElementById('alertBar');
  const alertClose = document.querySelector('.alert-bar__close');
  if (alertBar) {
    if (localStorage.getItem('bca-alert-dismissed')) {
      alertBar.remove();
    } else if (alertClose) {
      alertClose.addEventListener('click', () => {
        alertBar.classList.add('is-closed');
        localStorage.setItem('bca-alert-dismissed', '1');
        setTimeout(() => alertBar.remove(), 500);
      });
    }
  }

  // Page-flip snapping (homepage only). The hero sits below the alert
  // bar and nav, so without a matching scroll-margin the browser would
  // snap it to the top on load and swallow the alert bar immediately.
  const gate = document.querySelector('.gate');
  const chooser = document.getElementById('choose');
  if (gate && chooser) {
    const navH = () => (nav ? nav.getBoundingClientRect().height : 0);
    const syncSnapOffset = () => {
      document.documentElement.style.setProperty('--nav-h', navH() + 'px');
      document.documentElement.style.setProperty(
        '--gate-snap-offset', gate.offsetTop + 'px'
      );
    };
    syncSnapOffset();
    document.documentElement.classList.add('snap-page');
    window.addEventListener('resize', syncSnapOffset);
    // The alert bar collapses on dismiss, which moves the hero up.
    const bar = document.getElementById('alertBar');
    if (bar) bar.addEventListener('transitionend', syncSnapOffset);

    // One wheel gesture = one full section, like flipping a page. CSS
    // snapping alone won't do this: a short scroll just springs back to
    // the section you're already on. Touch devices are left alone —
    // native swipe + CSS snap already behaves this way there.
    // Flip stops end at the chooser. Past it the page scrolls normally
    // into the footer rather than snapping to another full screen.
    const sections = [
      gate,
      document.getElementById('solution'),
      chooser
    ].filter(Boolean);
    const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
    // Land each section just below the sticky nav rather than underneath
    // it, so the whole section is actually on screen.
    const targetY = (i) => {
      const raw = sections[i].offsetTop - navH();
      return Math.max(0, Math.min(raw, maxScroll()));
    };
    const nearestIndex = () => {
      let best = 0;
      let bestDist = Infinity;
      sections.forEach((_, i) => {
        const d = Math.abs(window.scrollY - targetY(i));
        if (d < bestDist) { bestDist = d; best = i; }
      });
      return best;
    };

    // Hand-rolled easing rather than scrollTo({behavior:'smooth'}): the
    // native curve is abrupt and its duration varies with distance, so
    // short and long flips feel inconsistent. Fixed duration + ease-in-out
    // makes every flip land the same way.
    // Ease-out rather than ease-in-out: the flip should commit the moment
    // you scroll and then settle, instead of easing in slowly at both
    // ends, which reads as sluggish.
    const FLIP_MS = 320;
    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

    let busy = false;
    let quietTimer = null;
    // Trackpads keep firing wheel events after the fingers lift. Staying
    // busy until the stream goes quiet stops that momentum tail from
    // cascading into a second and third flip.
    const settle = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => { busy = false; }, 90);
    };

    const animateTo = (y) => {
      const startY = window.scrollY;
      const dist = y - startY;
      if (Math.abs(dist) < 2) { settle(); return; }
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min((now - t0) / FLIP_MS, 1);
        // behavior:'auto' overrides the stylesheet's smooth scrolling,
        // which would otherwise try to animate every single frame.
        window.scrollTo({ top: startY + dist * easeOutQuart(p), behavior: 'auto' });
        if (p < 1) requestAnimationFrame(step);
        else settle();
      };
      requestAnimationFrame(step);
    };

    const flipTo = (i) => {
      const clamped = Math.max(0, Math.min(sections.length - 1, i));
      busy = true;
      animateTo(targetY(clamped));
    };
    const flipBy = (dir) => {
      const next = nearestIndex() + dir;
      if (next < 0 || next > sections.length - 1) { settle(); return; }
      flipTo(next);
    };

    // True while the page should still flip. Once we're at (and heading
    // down from) the final stop, or anywhere below it, normal scrolling
    // takes over so the footer is reached by ordinary scrolling.
    const lastStopY = () => targetY(sections.length - 1);
    const inFlipZone = (goingDown) => {
      const y = window.scrollY;
      if (y > lastStopY() + 2) return false;
      if (goingDown && y >= lastStopY() - 2) return false;
      return true;
    };

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (finePointer) {
      window.addEventListener('wheel', (e) => {
        if (document.body.classList.contains('menu-open')) return;
        if (busy) { e.preventDefault(); settle(); return; }
        // Below the last flip stop, or scrolling down from it: stop
        // intercepting and let the browser scroll into the footer.
        if (!inFlipZone(e.deltaY > 0)) return;
        e.preventDefault();
        if (Math.abs(e.deltaY) < 4) return;
        flipBy(e.deltaY > 0 ? 1 : -1);
      }, { passive: false });
    }

    // Route the hero arrow through the same animation so a click and a
    // scroll feel identical.
    const arrow = document.querySelector('.scroll-arrow');
    if (arrow && finePointer) {
      arrow.addEventListener('click', (e) => {
        e.preventDefault();
        busy = true;
        flipTo(1);
      });
    }

    window.addEventListener('keydown', (e) => {
      if (document.body.classList.contains('menu-open')) return;
      const down = ['ArrowDown', 'PageDown', ' '].includes(e.key);
      const up = ['ArrowUp', 'PageUp'].includes(e.key);
      if (!down && !up) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      if (!inFlipZone(down)) return;
      e.preventDefault();
      if (busy) return;
      flipBy(down ? 1 : -1);
    });
  }

  // Background video: only fetch it where it's worth the bytes. Phones,
  // save-data connections and reduced-motion users keep the poster.
  const bgVideos = document.querySelectorAll('video[data-src]');
  if (bgVideos.length) {
    const smallScreen = window.matchMedia('(max-width: 860px)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = navigator.connection && navigator.connection.saveData;
    if (!smallScreen && !reducedMotion && !saveData) {
      bgVideos.forEach((v) => { v.src = v.dataset.src; });
      // Both sections share one file, so the browser fetches it once —
      // but decoding two 1080p streams at once is wasted work when only
      // one section is on screen. Play whichever is in view, pause the rest.
      const videoIo = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.play().catch(() => {});
          else entry.target.pause();
        });
      }, { threshold: 0.25 });
      bgVideos.forEach((v) => videoIo.observe(v));
    }
  }

  // Scroll text reveal: split headings into word-masks, then cascade
  // them into place as each heading enters the viewport.
  const splitIntoWords = (el) => {
    const walk = (node) => {
      const frag = document.createDocumentFragment();
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (part === '') return;
            if (part.trim() === '') {
              frag.appendChild(document.createTextNode(part));
              return;
            }
            const mask = document.createElement('span');
            mask.className = 'tr-word';
            const inner = document.createElement('span');
            inner.className = 'tr-word-inner';
            inner.textContent = part;
            mask.appendChild(inner);
            frag.appendChild(mask);
          });
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const clone = child.cloneNode(false);
          clone.appendChild(walk(child));
          frag.appendChild(clone);
        }
      });
      return frag;
    };
    const result = walk(el);
    el.textContent = '';
    el.appendChild(result);
    el.querySelectorAll('.tr-word-inner').forEach((inner, i) => {
      inner.style.transitionDelay = Math.min(i * 45, 500) + 'ms';
    });
  };

  const textRevealEls = document.querySelectorAll('.text-reveal');
  textRevealEls.forEach(splitIntoWords);
  const trIo = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        trIo.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });
  textRevealEls.forEach((el) => trIo.observe(el));

  const onScroll = () => {
    if (!nav) return;
    nav.classList.toggle('is-scrolled', window.scrollY > 40);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Left-side nav drawer: hamburger morphs into an X, a scrim dims
  // the page behind, the drawer slides in from the left. Links
  // stagger in bottom-to-top on open; on close the stagger reverses
  // (top item leaves first, bottom item lingers longest) — same
  // total duration both ways, just opposite sweep direction.
  const mobileMenu = document.getElementById('mobileMenu');
  const menuScrim = document.getElementById('menuScrim');
  if (toggle && mobileMenu) {
    const menuItems = mobileMenu.querySelectorAll('.mobile-menu__links a, .mobile-menu__cta');
    const total = menuItems.length;
    const ANIMATION_MS = 1150; // time to let the close fade finish before navigating

    const openMenu = () => {
      menuItems.forEach((el, i) => {
        el.style.transitionDelay = ((total - 1 - i) * 130) + 'ms';
      });
      mobileMenu.classList.add('is-open');
      if (menuScrim) menuScrim.classList.add('is-open');
      toggle.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('menu-open');
    };
    const closeMenu = () => {
      menuItems.forEach((el, i) => {
        el.style.transitionDelay = (i * 130) + 'ms';
      });
      mobileMenu.classList.remove('is-open');
      if (menuScrim) menuScrim.classList.remove('is-open');
      toggle.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    };

    toggle.addEventListener('click', () => {
      mobileMenu.classList.contains('is-open') ? closeMenu() : openMenu();
    });
    // Clicking a link inside the drawer would otherwise start navigating
    // immediately, tearing down the page mid-animation so the close
    // never gets a chance to play. Let the close finish first, then go.
    menuItems.forEach((el) => {
      el.addEventListener('click', (e) => {
        const href = el.getAttribute('href');
        if (href) {
          e.preventDefault();
          closeMenu();
          setTimeout(() => { window.location.href = href; }, ANIMATION_MS);
        } else {
          closeMenu();
        }
      });
    });
    if (menuScrim) menuScrim.addEventListener('click', closeMenu);
  }

  // Scroll reveal (staggered within shared parents)
  const revealEls = document.querySelectorAll('.reveal');
  const staggerGroups = new WeakMap();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const parent = el.parentElement;
        let index = staggerGroups.get(parent);
        if (index === undefined) index = 0;
        staggerGroups.set(parent, index + 1);
        el.style.transitionDelay = Math.min(index * 90, 360) + 'ms';
        el.classList.add('is-visible');
        io.unobserve(el);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach((el) => io.observe(el));

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const interactionsEnabled = !prefersReducedMotion && isFinePointer;

  if (interactionsEnabled) {
    // Custom cursor: a dot that tracks instantly, a ring that trails and
    // grows over interactive elements.
    const cursorDot = document.createElement('div');
    const cursorRing = document.createElement('div');
    cursorDot.className = 'cursor-dot';
    cursorRing.className = 'cursor-ring';
    document.body.append(cursorDot, cursorRing);
    document.body.classList.add('has-custom-cursor');

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      cursorDot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
    });

    const animateRing = () => {
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;
      cursorRing.style.transform = `translate(${ringX}px, ${ringY}px)`;
      requestAnimationFrame(animateRing);
    };
    animateRing();

    const hoverTargets = document.querySelectorAll(
      'a, button, .card, .testimonial-card, .map-pin, input, textarea'
    );
    hoverTargets.forEach((el) => {
      el.addEventListener('mouseenter', () => document.body.classList.add('cursor-active'));
      el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-active'));
    });

    // Magnetic pull on buttons / nav CTA
    const magneticEls = document.querySelectorAll('.btn, .nav-cta');
    magneticEls.forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const relX = e.clientX - rect.left - rect.width / 2;
        const relY = e.clientY - rect.top - rect.height / 2;
        el.style.transform = `translate(${relX * 0.25}px, ${relY * 0.35}px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    });

    // 3D tilt on cards
    const tiltEls = document.querySelectorAll('.card, .testimonial-card');
    tiltEls.forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.transform = `perspective(800px) rotateX(${py * -6}deg) rotateY(${px * 8}deg) translateY(-4px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    });
  }

  // Persona forms (homeowner / investor / agent): on submit, swap the
  // form out for a follow-up panel with the "explore the site" CTA.
  document.querySelectorAll('.persona-form').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const followup = form.parentElement.querySelector('.form-followup');
      form.style.display = 'none';
      if (followup) followup.classList.add('is-visible');
    });
  });

  // Calgary map. Real coordinates on a dark basemap so it reads as part
  // of the section rather than a bright map dropped into a navy page.
  const mapEl = document.getElementById('calgaryMap');
  if (mapEl && window.L) {
    const places = [
      { name: 'Altadore',    work: 'Lot subdivision (R-C2)', lat: 51.0175, lng: -114.0975 },
      { name: 'Killarney',   work: 'Full teardown rebuild',  lat: 51.0330, lng: -114.1120 },
      { name: 'Bridgeland',  work: 'Renovation + resale',    lat: 51.0530, lng: -114.0400 },
      { name: 'Renfrew',     work: 'Sold as-is, 3 offers',   lat: 51.0600, lng: -114.0430 },
      { name: 'Bowness',     work: 'Lot subdivision',        lat: 51.0870, lng: -114.1980 },
      { name: 'Airdrie, AB', work: 'Held & refinanced',      lat: 51.2917, lng: -114.0144 }
    ];

    const map = L.map(mapEl, {
      scrollWheelZoom: false, // otherwise the page can't be scrolled past the map
      zoomControl: true,
      attributionControl: true
    });

    // Esri's dark canvas: natively dark (so it sits inside the navy
    // section without a filter hack) and needs no API key. CARTO's dark
    // basemap now watermarks every tile with "API KEY REQUIRED".
    const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
    L.tileLayer(esri + 'World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 16
    }).addTo(map);
    // Labels ship as a separate overlay on Esri's canvas basemaps.
    L.tileLayer(esri + 'World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16
    }).addTo(map);

    const pin = L.divIcon({
      className: 'map-marker',
      html: '<span class="map-marker__dot"></span>',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const markers = places.map((p) =>
      L.marker([p.lat, p.lng], { icon: pin, title: p.name })
        .addTo(map)
        .bindPopup('<strong>' + p.name + '</strong><br>' + p.work)
    );

    // Frame every pin rather than hard-coding a centre and zoom.
    map.fitBounds(L.featureGroup(markers).getBounds(), { padding: [50, 50] });
    // Leaflet mis-measures if it initialises while the section is still
    // animating in, so re-check once things have settled.
    setTimeout(() => map.invalidateSize(), 400);
    window.addEventListener('resize', () => map.invalidateSize());
  }

  // Expandable step cards: click a tile to reveal its copy. Only one
  // stays open, so the row never grows into a wall of text.
  const stepCards = document.querySelectorAll('.step-card');
  if (stepCards.length) {
    // Heights are applied in pixels so the roll can animate. A card's
    // open height is its own image ratio, which keeps the whole photo in
    // frame at the end of the roll.
    const closedHeight = (card) => {
      const toggle = card.querySelector('.step-card__toggle');
      return toggle ? parseFloat(getComputedStyle(toggle).minHeight) || 190 : 190;
    };
    // A consistent wide band rather than each image's full height. Full
    // ratios ran 626-744px and varied per card, which looked uneven and
    // swallowed the page; this crops to a clean, uniform strip.
    const OPEN_RATIO = 2.6;
    const OPEN_MIN = 300;
    const openHeight = (card) =>
      Math.max(card.getBoundingClientRect().width / OPEN_RATIO, OPEN_MIN);
    const applyHeight = (card) => {
      const open = card.classList.contains('is-open');
      // min-height rather than height: if the copy ever runs longer than
      // the photo allows, the card grows instead of clipping it.
      card.style.minHeight = (open ? openHeight(card) : closedHeight(card)) + 'px';
    };

    stepCards.forEach(applyHeight);
    window.addEventListener('resize', () => stepCards.forEach(applyHeight));

    stepCards.forEach((card) => {
      const toggle = card.querySelector('.step-card__toggle');
      if (!toggle) return;
      toggle.addEventListener('click', () => {
        const willOpen = !card.classList.contains('is-open');
        stepCards.forEach((other) => {
          other.classList.remove('is-open');
          const t = other.querySelector('.step-card__toggle');
          if (t) t.setAttribute('aria-expanded', 'false');
        });
        if (willOpen) {
          card.classList.add('is-open');
          toggle.setAttribute('aria-expanded', 'true');
        }
        // Roll every card to its new height, so the one closing animates
        // shut at the same time the other opens.
        stepCards.forEach(applyHeight);
      });
    });
  }

  // Animated stat counters
  const statEls = document.querySelectorAll('.stat-num[data-count]');
  const countUp = (el) => {
    const target = parseFloat(el.dataset.count);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals, 10) : 0;
    const duration = 1400;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = target * eased;
      el.textContent = prefix + value.toFixed(decimals) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const statIo = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        countUp(entry.target);
        statIo.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });
  statEls.forEach((el) => statIo.observe(el));
});
