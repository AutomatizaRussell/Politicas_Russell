(function () {
  var body = document.body;
  var tabs = document.querySelectorAll('.company-tab');

  function setCompany(company) {
    body.dataset.activeCompany = company;
    tabs.forEach(function (tab) {
      var active = tab.dataset.select === company;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('ol.toc-list a.active').forEach(function (l) {
      l.classList.remove('active');
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { setCompany(tab.dataset.select); });
  });

  var backToTop = document.querySelector('.back-to-top');
  var progressBar = document.querySelector('[data-reading-progress]');
  window.addEventListener('scroll', function () {
    if (backToTop) backToTop.classList.toggle('visible', window.scrollY > 400);
    if (progressBar) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      progressBar.style.width = pct + '%';
    }
  }, { passive: true });

  document.querySelectorAll('[data-toc-search]').forEach(function (input) {
    var container = input.closest('nav');
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      container.querySelectorAll('ol.toc-list li').forEach(function (li) {
        var match = !q || li.textContent.toLowerCase().indexOf(q) !== -1;
        li.style.display = match ? '' : 'none';
        if (match && q) {
          var details = li.closest('details.toc-section');
          if (details) details.open = true;
        }
      });
    });
  });

  var sections = document.querySelectorAll('.sheet [id]');
  var tocLinks = document.querySelectorAll('ol.toc-list a[href^="#"]');
  if (sections.length && tocLinks.length && 'IntersectionObserver' in window) {
    var linksById = {};
    tocLinks.forEach(function (link) {
      var id = link.getAttribute('href').slice(1);
      (linksById[id] = linksById[id] || []).push(link);
    });

    var activeId = null;
    var setActiveHeading = function (id) {
      if (id === activeId) return;
      if (activeId && linksById[activeId]) {
        linksById[activeId].forEach(function (l) { l.classList.remove('active'); });
      }
      activeId = id;
      if (id && linksById[id]) {
        linksById[id].forEach(function (l) {
          l.classList.add('active');
          var nav = l.closest('nav');
          var group = l.closest('details.toc-section');
          if (nav && group) {
            group.open = true;
            nav.querySelectorAll('details.toc-section').forEach(function (d) {
              if (d !== group) d.open = false;
            });
          }
          if (nav && l.offsetParent !== null) {
            var navRect = nav.getBoundingClientRect();
            var linkRect = l.getBoundingClientRect();
            var delta = (linkRect.top - navRect.top) - (nav.clientHeight / 2) + (linkRect.height / 2);
            nav.scrollBy({ top: delta, behavior: 'smooth' });
          }
        });
      }
    };

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActiveHeading(entry.target.id);
      });
    }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 });

    sections.forEach(function (el) {
      if (linksById[el.id]) observer.observe(el);
    });

    var activateLastVisibleAtBottom = function () {
      var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (!atBottom) return;
      var lastVisible = null;
      sections.forEach(function (el) {
        if (linksById[el.id] && el.offsetParent !== null) lastVisible = el;
      });
      if (lastVisible) setActiveHeading(lastVisible.id);
    };
    window.addEventListener('scroll', activateLastVisibleAtBottom, { passive: true });
    activateLastVisibleAtBottom();
  }
})();
