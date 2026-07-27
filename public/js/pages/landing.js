'use strict';

/**
 * Slideshow - accessible, auto-advancing carousel.
 * Attaches to any element carrying [data-slideshow].
 */
class Slideshow {
  /** @param {HTMLElement} root */
  constructor(root) {
    this._root = root;
    this._slides = [...root.querySelectorAll('.slide')];
    this._dotsBox = root.querySelector('.slide-dots');
    this._index = 0;
    this._intervalMs = Number(root.dataset.interval) || 5000;
    this._timer = null;
    this._reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._buildDots();
    this._bind();
    this._start();
  }

  _buildDots() {
    this._slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.addEventListener('click', () => this.goTo(i));
      this._dotsBox.appendChild(dot);
    });
    this._syncDots();
  }

  _bind() {
    this._root.querySelector('.prev').addEventListener('click', () => this.step(-1));
    this._root.querySelector('.next').addEventListener('click', () => this.step(1));
    this._root.addEventListener('mouseenter', () => this._stop());
    this._root.addEventListener('mouseleave', () => this._start());
    this._root.addEventListener('focusin', () => this._stop());
    this._root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.step(-1);
      if (e.key === 'ArrowRight') this.step(1);
    });
  }

  goTo(index) {
    this._index = (index + this._slides.length) % this._slides.length;
    this._slides.forEach((s, i) => s.classList.toggle('active', i === this._index));
    this._syncDots();
  }

  step(delta) { this.goTo(this._index + delta); }

  _syncDots() {
    [...this._dotsBox.children].forEach((dot, i) =>
      dot.setAttribute('aria-current', String(i === this._index)));
  }

  _start() {
    if (this._reducedMotion || this._timer) return;
    this._timer = setInterval(() => this.step(1), this._intervalMs);
  }

  _stop() {
    clearInterval(this._timer);
    this._timer = null;
  }
}

document.querySelectorAll('[data-slideshow]').forEach((el) => new Slideshow(el));
