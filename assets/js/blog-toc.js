(() => {
  const toc = document.querySelector('.post-toc');
  if (!toc) return;

  const details = toc.querySelector('details');
  const desktop = window.matchMedia('(min-width: 1100px)');
  const setExpanded = () => { details.open = desktop.matches; };
  setExpanded();
  desktop.addEventListener('change', setExpanded);

  const sections = Array.from(toc.querySelectorAll('a[href^="#"]'))
    .map(link => ({ link, heading: document.getElementById(link.hash.slice(1)) }))
    .filter(section => section.heading)
    .sort((a, b) => a.heading.compareDocumentPosition(b.heading) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  if (!sections.length) return;

  let activeLink;
  let scheduled = false;
  const updateActive = () => {
    scheduled = false;
    let active = sections[0];
    for (const section of sections) {
      if (section.heading.getBoundingClientRect().top > 48) break;
      active = section;
    }
    if (active.link === activeLink) return;
    if (activeLink) activeLink.removeAttribute('aria-current');
    activeLink = active.link;
    activeLink.setAttribute('aria-current', 'location');

    // Keep the current link visible inside a long sidebar without moving the page.
    if (desktop.matches && details.open) {
      const list = toc.querySelector('.post-toc__links');
      const linkBounds = activeLink.getBoundingClientRect();
      const listBounds = list.getBoundingClientRect();
      if (linkBounds.top < listBounds.top) list.scrollTop += linkBounds.top - listBounds.top;
      else if (linkBounds.bottom > listBounds.bottom) list.scrollTop += linkBounds.bottom - listBounds.bottom;
    }
  };
  const scheduleUpdate = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(updateActive);
  };

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('load', scheduleUpdate);
  details.addEventListener('toggle', scheduleUpdate);
  updateActive();
})();
