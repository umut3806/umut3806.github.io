(() => {
  const viewer = document.querySelector('.image-viewer');
  if (!viewer || typeof viewer.showModal !== 'function') return;

  const enlargedImage = viewer.querySelector('.image-viewer__image');
  const caption = viewer.querySelector('.image-viewer__caption');
  const originalLink = viewer.querySelector('.image-viewer__original');
  let activeTrigger;

  document.querySelectorAll('.blog-post img').forEach((image) => {
    // Preserve images that already act as links or controls.
    if (image.closest('a, button')) return;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'blog-image-trigger';
    trigger.setAttribute('aria-label', `Enlarge image: ${image.alt || 'Blog image'}`);
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.title = 'Click to enlarge';
    image.replaceWith(trigger);
    trigger.append(image);

    trigger.addEventListener('click', () => {
      activeTrigger = trigger;
      enlargedImage.src = image.currentSrc || image.src;
      enlargedImage.alt = image.alt;
      caption.textContent = image.alt;
      originalLink.href = enlargedImage.src;
      viewer.showModal();
      document.documentElement.classList.add('image-viewer-open');
    });
  });

  viewer.querySelector('.image-viewer__close').addEventListener('click', () => viewer.close());

  viewer.addEventListener('click', (event) => {
    const bounds = viewer.getBoundingClientRect();
    if (event.target === viewer && (
      event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom
    )) viewer.close();
  });

  // Native dialog handles Escape and keeps keyboard focus inside the overlay.
  viewer.addEventListener('close', () => {
    document.documentElement.classList.remove('image-viewer-open');
    enlargedImage.removeAttribute('src');
    activeTrigger?.focus({ preventScroll: true });
  });
})();
