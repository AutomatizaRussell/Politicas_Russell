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
})();
