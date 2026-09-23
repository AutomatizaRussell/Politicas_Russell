(function () {
  'use strict';

  var body = document.body;
  var tabs = document.querySelectorAll('.company-tab');
  var backToTop = document.querySelector('.back-to-top');
  var progressBar = document.querySelector('[data-reading-progress]');
  var sections = document.querySelectorAll('.sheet [id]');
  var tocLinks = document.querySelectorAll('ol.toc-list a[href^="#"]');

  var linksById = {};
  tocLinks.forEach(function (link) {
    var id = link.getAttribute('href').slice(1);
    (linksById[id] = linksById[id] || []).push(link);
  });

  // Declared early so setCompany() below can reset it when switching tabs.
  var activeId = null;

  // --- Company tabs ---------------------------------------------------------
  function setCompany(company) {
    body.dataset.activeCompany = company;
    tabs.forEach(function (tab) {
      var active = tab.dataset.select === company;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('ol.toc-list a.active').forEach(function (link) {
      link.classList.remove('active');
    });
    activeId = null;
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { setCompany(tab.dataset.select); });
  });

  // --- TOC search ---------------------------------------------------------
  document.querySelectorAll('[data-toc-search]').forEach(function (input) {
    var container = input.closest('nav');
    input.addEventListener('input', function () {
      var query = input.value.trim().toLowerCase();
      container.querySelectorAll('ol.toc-list li').forEach(function (li) {
        var match = !query || li.textContent.toLowerCase().indexOf(query) !== -1;
        li.style.display = match ? '' : 'none';
        if (match && query) {
          var details = li.closest('details.toc-section');
          if (details) details.open = true;
        }
      });
    });
  });

  function isSearching(nav) {
    var input = nav.querySelector('[data-toc-search]');
    return !!(input && input.value.trim());
  }

  // --- Active heading (scroll-spy) -----------------------------------------
  // Keeps the active link visible inside whichever ancestor actually scrolls.
  // The desktop sidebar scrolls internally, so it's recentered directly and
  // in isolation; the mobile dropdown has no scroll box of its own, so the
  // browser is left to scroll the page instead.
  function revealActiveLink(link, nav) {
    var scrollsInternally = nav.scrollHeight > nav.clientHeight + 1;
    if (!scrollsInternally) {
      link.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    var navRect = nav.getBoundingClientRect();
    var linkRect = link.getBoundingClientRect();
    var alreadyVisible = linkRect.top >= navRect.top && linkRect.bottom <= navRect.bottom;
    if (alreadyVisible) return;
    var delta = (linkRect.top - navRect.top) - (nav.clientHeight / 2) + (linkRect.height / 2);
    nav.scrollBy({ top: delta, behavior: 'smooth' });
  }

  function setActiveHeading(id) {
    if (id === activeId) return;
    if (activeId && linksById[activeId]) {
      linksById[activeId].forEach(function (link) { link.classList.remove('active'); });
    }
    activeId = id;
    if (!id || !linksById[id]) return;

    linksById[id].forEach(function (link) {
      link.classList.add('active');
      var nav = link.closest('nav');
      var group = link.closest('details.toc-section');
      if (nav && group && !isSearching(nav)) {
        group.open = true;
        nav.querySelectorAll('details.toc-section').forEach(function (d) {
          if (d !== group) d.open = false;
        });
      }
      if (nav && link.offsetParent !== null) revealActiveLink(link, nav);
    });
  }

  var hasObserver = sections.length && tocLinks.length && 'IntersectionObserver' in window;
  if (hasObserver) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActiveHeading(entry.target.id);
      });
    }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 });

    sections.forEach(function (el) {
      if (linksById[el.id]) observer.observe(el);
    });
  }

  // Short trailing sections may never cross the observer's trigger band, so
  // the very bottom of the page is treated as a forced activation of the
  // last visible heading.
  function activateLastVisibleAtBottom() {
    if (!hasObserver) return;
    var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (!atBottom) return;
    var lastVisible = null;
    sections.forEach(function (el) {
      if (linksById[el.id] && el.offsetParent !== null) lastVisible = el;
    });
    if (lastVisible) setActiveHeading(lastVisible.id);
  }

  // --- Scroll effects (progress bar, back-to-top, bottom detection) -------
  var scrollTicking = false;
  function onScroll() {
    if (backToTop) backToTop.classList.toggle('visible', window.scrollY > 400);
    if (progressBar) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
    }
    activateLastVisibleAtBottom();
    scrollTicking = false;
  }
  window.addEventListener('scroll', function () {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(onScroll);
    }
  }, { passive: true });

  activateLastVisibleAtBottom();
})();
