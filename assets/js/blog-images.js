(() => {
  const viewer = document.querySelector('.image-viewer');
  if (!viewer || typeof viewer.showModal !== 'function') return;

  const enlargedImage = viewer.querySelector('.image-viewer__image');
  const caption = viewer.querySelector('.image-viewer__caption');
  const originalLink = viewer.querySelector('.image-viewer__original');
  const viewport = viewer.querySelector('.image-viewer__viewport');
  let activeTrigger;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  const pointers = new Map();
  let pinch;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const renderZoom = () => {
    const maxX = Math.max(0, (enlargedImage.offsetWidth * scale - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (enlargedImage.offsetHeight * scale - viewport.clientHeight) / 2);
    offsetX = clamp(offsetX, -maxX, maxX);
    offsetY = clamp(offsetY, -maxY, maxY);
    enlargedImage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    viewport.classList.toggle('is-zoomed', scale > 1);
    viewport.classList.toggle('is-dragging', pointers.size > 0 && scale > 1);
  };

  const stopGesture = () => {
    const ids = [...pointers.keys()];
    pointers.clear();
    pinch = undefined;
    ids.forEach((id) => {
      if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
    });
    viewport.classList.remove('is-dragging');
  };

  const resetZoom = () => {
    stopGesture();
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    renderZoom();
  };

  const zoomAt = (nextScale, x = 0, y = 0) => {
    nextScale = clamp(nextScale, 1, 8);
    const ratio = nextScale / scale;
    offsetX = x - (x - offsetX) * ratio;
    offsetY = y - (y - offsetY) * ratio;
    scale = nextScale;
    renderZoom();
  };

  viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    // Normalize mouse wheels (lines/pages) and trackpads (pixels).
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    const delta = clamp(event.deltaY * unit, -100, 100);
    const bounds = viewport.getBoundingClientRect();
    zoomAt(scale * Math.exp(-delta * 0.002),
      event.clientX - bounds.left - bounds.width / 2,
      event.clientY - bounds.top - bounds.height / 2);
  }, { passive: false });

  const pinchGeometry = () => {
    const [first, second] = pointers.values();
    const bounds = viewport.getBoundingClientRect();
    return {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      x: (first.x + second.x) / 2 - bounds.left - bounds.width / 2,
      y: (first.y + second.y) / 2 - bounds.top - bounds.height / 2,
    };
  };

  viewport.addEventListener('pointerdown', (event) => {
    // Track touches at the initial scale so a second finger can start zooming.
    if (event.button !== 0 || pointers.size >= 2 ||
      (event.pointerType !== 'touch' && scale <= 1)) return;
    event.preventDefault();
    viewport.focus({ preventScroll: true });
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.setPointerCapture(event.pointerId);
    if (pointers.size === 2) pinch = { ...pinchGeometry(), scale, offsetX, offsetY };
    renderZoom();
  });

  viewport.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch) {
      const current = pinchGeometry();
      scale = clamp(pinch.scale * current.distance / pinch.distance, 1, 8);
      const ratio = scale / pinch.scale;
      // Keep the image point under the fingers anchored as their midpoint moves.
      offsetX = current.x - (pinch.x - pinch.offsetX) * ratio;
      offsetY = current.y - (pinch.y - pinch.offsetY) * ratio;
    } else if (scale > 1) {
      offsetX += event.clientX - previous.x;
      offsetY += event.clientY - previous.y;
    }
    renderZoom();
  });

  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
    viewport.addEventListener(type, (event) => {
      if (!pointers.delete(event.pointerId)) return;
      pinch = undefined;
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      renderZoom();
    });
  });

  viewport.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '0') resetZoom();
      else zoomAt(scale * (event.key === '-' ? 1 / 1.2 : 1.2));
    }
  });

  viewer.querySelector('.image-viewer__reset').addEventListener('click', resetZoom);
  enlargedImage.addEventListener('load', resetZoom);
  window.addEventListener('resize', () => {
    if (viewer.open) renderZoom();
  });

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
      resetZoom();
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
    resetZoom();
    document.documentElement.classList.remove('image-viewer-open');
    enlargedImage.removeAttribute('src');
    activeTrigger?.focus({ preventScroll: true });
  });
})();
