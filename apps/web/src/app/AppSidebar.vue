<script setup lang="ts">
import { ref } from 'vue';
import logoUrl from '@/assets/almasampler-logo.png';
import supportGifUrl from '@/assets/support-popup.gif';

const isMenuOpen = ref(false);
const isSupportOpen = ref(false);

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value;
}

function openSupport() {
  isSupportOpen.value = true;
  isMenuOpen.value = false;
}
</script>

<template>
  <button
    class="app-sidebar__burger"
    type="button"
    aria-label="Open menu"
    title="Open menu"
    @click="toggleMenu"
  >
    <span />
    <span />
    <span />
  </button>

  <div
    v-if="isMenuOpen"
    class="app-sidebar__scrim"
    @click="isMenuOpen = false"
  />

  <aside class="app-sidebar" :class="{ 'app-sidebar--open': isMenuOpen }">
    <div class="app-sidebar__logo">
      <img :src="logoUrl" alt="Almasampler" class="app-sidebar__logo-image" />
    </div>

    <nav class="app-sidebar__nav" aria-label="Feature navigation">
      <button class="app-sidebar__item app-sidebar__item--active" type="button">
        Sampler
      </button>
      <button class="app-sidebar__item" type="button" disabled>
        Stems
      </button>
      <button class="app-sidebar__item" type="button" disabled>
        Projects
      </button>
      <button class="app-sidebar__item" type="button" disabled>
        Library
      </button>
    </nav>

    <button class="app-sidebar__support" type="button" @click="openSupport">
      Contact / Support
    </button>
  </aside>

  <div
    v-if="isSupportOpen"
    class="support-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="support-modal-title"
    @click.self="isSupportOpen = false"
  >
    <div class="support-modal__card">
      <button class="support-modal__close" type="button" @click="isSupportOpen = false">
        Close
      </button>

      <img :src="supportGifUrl" alt="Support gif" class="support-modal__gif" />

      <div class="support-modal__copy">
        <h3 id="support-modal-title">Hey friend</h3>
        <p>
          If you enjoyed the project and want to support the author, or if you have any
          feedback, send an email to
          <a href="mailto:oneera.pro@gmail.com">oneera.pro@gmail.com</a>.
        </p>
        <p class="support-modal__donate">
          Want to donate directly?
          <a href="https://boosty.to/onlyoneera/donate" target="_blank" rel="noreferrer">
            Support on Boosty
          </a>
        </p>
      </div>
    </div>
  </div>
</template>
